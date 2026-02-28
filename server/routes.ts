import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import YahooFinance from 'yahoo-finance2';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import path from 'path';

const yf = new YahooFinance();


let industryList: { symbol: string; name: string; industry: string }[] = [];

async function loadExcelData() {
  try {
    const filePath = path.resolve(process.cwd(), 'attached_assets', 'INDIAN_COMPANIES_LIST_INDUSTRY_WISE_1767863645829.xlsx');
    if (fs.existsSync(filePath)) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const sheet = workbook.worksheets[0];
      if (!sheet) return;

      const rawData: any[][] = [];
      sheet.eachRow((row) => {
        const vals = row.values as any[];
        rawData.push(vals.slice(1));
      });

      if (rawData.length > 0) {
        const headers = rawData[0].map((h: any) => String(h || '').trim().toLowerCase());

        const nameIdx = headers.findIndex(h => h.includes('company') || h === 'name');
        const tickerIdx = headers.findIndex(h => h.includes('ticker') || h === 'symbol');
        const industryIdx = headers.findIndex(h => h === 'industry group' || h === 'industry' || h === 'sector');

        if (tickerIdx !== -1) {
          industryList = rawData.slice(1).map(row => {
            const rowData = row as any[];
            const rawTicker = String(rowData[tickerIdx] || '').trim();
            const symbol = rawTicker.includes(':') ? rawTicker.split(':')[1] : rawTicker;

            return {
              symbol: symbol,
              name: nameIdx !== -1 ? String(rowData[nameIdx] || '').trim() : '',
              industry: industryIdx !== -1 ? String(rowData[industryIdx] || '').trim() : ''
            };
          }).filter(item => item.symbol);
        }
      }
    }
  } catch (error) {
    console.error("Error loading Excel file:", error);
  }
}

loadExcelData();

// Helper to calculate financial metrics
function calculateFinancialMetrics(stockPrices: number[], marketPrices: number[]) {
  if (stockPrices.length !== marketPrices.length || stockPrices.length < 2) return null;

  const stockReturns: number[] = [];
  const marketReturns: number[] = [];

  for (let i = 1; i < stockPrices.length; i++) {
    const sRet = (stockPrices[i] - stockPrices[i - 1]) / stockPrices[i - 1];
    const mRet = (marketPrices[i] - marketPrices[i - 1]) / marketPrices[i - 1];
    stockReturns.push(sRet);
    marketReturns.push(mRet);
  }

  const n = stockReturns.length;
  if (n < 2) return null;

  const meanStock = stockReturns.reduce((a, b) => a + b, 0) / n;
  const meanMarket = marketReturns.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let varianceMarket = 0;
  let varianceStock = 0;

  for (let i = 0; i < n; i++) {
    const diffS = stockReturns[i] - meanStock;
    const diffM = marketReturns[i] - meanMarket;
    covariance += diffS * diffM;
    varianceMarket += diffM ** 2;
    varianceStock += diffS ** 2;
  }

  if (varianceMarket === 0 || varianceStock === 0) return null;

  const beta = covariance / varianceMarket;
  const alpha = meanStock - (beta * meanMarket);
  const correlation = covariance / (Math.sqrt(varianceStock) * Math.sqrt(varianceMarket));
  const rSquared = correlation ** 2;
  const standardDeviation = Math.sqrt(varianceStock / (n - 1));
  const volatility = standardDeviation * Math.sqrt(252);

  return {
    beta,
    alpha,
    correlation,
    rSquared,
    volatility
  };
}

async function fetchHistoricalData(ticker: string, startDate: string, endDate: string) {
  try {
    const result = await yf.historical(ticker, {
      period1: new Date(startDate),
      period2: new Date(endDate),
      interval: '1d'
    });
    return result;
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
    return null;
  }
}

async function getPeers(ticker: string, exchangeRate: number): Promise<{ slug: string; sector: string; marketCap: number }[]> {
  try {
    const summary = await yf.quoteSummary(ticker, { modules: ['assetProfile', 'summaryDetail'] }).catch(() => null);
    if (!summary?.assetProfile) return [];

    const targetIndustry = summary.assetProfile.industry || "";
    const tickerBase = ticker.split('.')[0];
    const excelMatch = industryList.find(i => i.symbol === tickerBase);
    const excelIndustry = excelMatch?.industry;

    let candidateSymbols: string[] = [];
    const recommendations = await yf.recommendationsBySymbol(ticker);
    candidateSymbols = recommendations?.recommendedSymbols?.map((r: any) => r.symbol) || [];

    if (excelIndustry) {
      const industryPeers = industryList
        .filter(item => item.industry === excelIndustry && item.symbol !== tickerBase)
        .map(item => `${item.symbol}.NS`); // Default to NSE
      candidateSymbols = Array.from(new Set([...candidateSymbols, ...industryPeers]));
    }

    const peerSummaries = await Promise.all(
      candidateSymbols.slice(0, 20).map(s => yf.quoteSummary(s, { modules: ['assetProfile', 'summaryDetail', 'financialData'] }).catch(() => null))
    );

    const verifiedPeers = await Promise.all(candidateSymbols.slice(0, 20).map(async (symbol, i) => {
      const s = peerSummaries[i];
      if (!s?.assetProfile || symbol === ticker) return null;
      
      const isSameIndustry = s.assetProfile.industry === targetIndustry || 
                            (excelIndustry && industryList.find(item => item.symbol === symbol.split('.')[0])?.industry === excelIndustry);
      
      if (!isSameIndustry) return null;

      const quote = await yf.quote(symbol).catch(() => null);
      const peerCurrency = quote?.currency || s.financialData?.financialCurrency || 'INR';
      const peerConversionFactor = peerCurrency === 'USD' ? exchangeRate : 1;
      const peerMarketCap = (s.summaryDetail?.marketCap || 0) * peerConversionFactor;

      return {
        slug: symbol,
        sector: `${s.assetProfile.sector || 'Unknown'} > ${s.assetProfile.industry || 'Unknown'}`,
        marketCap: peerMarketCap
      };
    }));

    return verifiedPeers.filter((p): p is any => p !== null).sort((a, b) => b.marketCap - a.marketCap).slice(0, 10);
  } catch (error) {
    console.error("Error fetching peers:", error);
    return [];
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.post(api.beta.calculate.path, async (req, res) => {
    try {
      const { ticker, exchange, startDate, endDate, period } = api.beta.calculate.input.parse(req.body);
      const suffix = exchange === "NSE" ? ".NS" : ".BO";
      const marketTicker = exchange === "NSE" ? "^NSEI" : "^BSESN";
      const fullTicker = ticker.endsWith(suffix) ? ticker : `${ticker}${suffix}`;

      const [marketData, stockData, quote, financials, usdInr] = await Promise.all([
        fetchHistoricalData(marketTicker, startDate, endDate),
        fetchHistoricalData(fullTicker, startDate, endDate),
        yf.quote(fullTicker).catch(() => null),
        yf.quoteSummary(fullTicker, { modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail'] }).catch(() => null),
        yf.quote('USDINR=X').catch(() => null)
      ]);

      const exchangeRate = usdInr?.regularMarketPrice || 83.0;

      if (!marketData || marketData.length === 0 || !stockData || stockData.length === 0) {
        return res.status(404).json({ message: "Failed to fetch market or stock data." });
      }

      const dateMap = new Map<string, number>();
      marketData.forEach(d => { if (d && d.close) dateMap.set(d.date.toISOString().split('T')[0], d.close); });

      const sPrices: number[] = [], mPrices: number[] = [];
      stockData.forEach(d => {
        const dateStr = d.date.toISOString().split('T')[0];
        const mPrice = dateMap.get(dateStr);
        if (mPrice && d.close) { sPrices.push(d.close); mPrices.push(mPrice); }
      });

      const metrics = calculateFinancialMetrics(sPrices, mPrices);
      if (!metrics) return res.status(400).json({ message: "Insufficient data points." });

      // Trading currency (quote.currency) = currency of the stock price, e.g. INR for NSE stocks
      // Financial currency (financialData.financialCurrency) = currency financials are reported in, e.g. USD for Wipro
      // These are DIFFERENT for companies like Wipro that trade in INR but report revenue in USD
      const tradingCurrency = quote?.currency || 'INR';
      const financialCurrency = financials?.financialData?.financialCurrency || tradingCurrency;

      const priceFactor = tradingCurrency === 'USD' ? exchangeRate : 1;       // for market cap, EV (price-based)
      const financialFactor = financialCurrency === 'USD' ? exchangeRate : 1; // for revenue, EBITDA (report-based)

      const targetData = {
        ticker: fullTicker,
        name: quote?.longName || quote?.shortName || ticker,
        marketIndex: exchange === "NSE" ? "NIFTY 50" : "BSE SENSEX",
        beta: metrics.beta,
        volatility: metrics.volatility,
        alpha: metrics.alpha,
        correlation: metrics.correlation,
        rSquared: metrics.rSquared,
        period: period || "5Y",
        marketCap: (quote?.marketCap || 0) * priceFactor,
        revenue: (financials?.financialData?.totalRevenue || 0) * financialFactor,
        enterpriseValue: (financials?.defaultKeyStatistics?.enterpriseValue || 0) * priceFactor,
        evRevenueMultiple: (financials?.defaultKeyStatistics?.enterpriseValue && financials?.financialData?.totalRevenue) ? (financials.defaultKeyStatistics.enterpriseValue / (financials.financialData.totalRevenue * financialFactor / priceFactor)) : undefined,
        peRatio: financials?.summaryDetail?.trailingPE,
        pbRatio: financials?.defaultKeyStatistics?.priceToBook,
        dividendYield: financials?.summaryDetail?.dividendYield,
        ebitda: (financials?.financialData?.ebitda || 0) * financialFactor,
        debtToEquity: financials?.financialData?.debtToEquity,
        profitMargin: financials?.financialData?.profitMargins,
      };

      const peerList = await getPeers(fullTicker, exchangeRate);
      const peerResults = await Promise.all(peerList.map(async (peer) => {
        const [pData, pQuote, pFin] = await Promise.all([
          fetchHistoricalData(peer.slug, startDate, endDate),
          yf.quote(peer.slug).catch(() => null),
          yf.quoteSummary(peer.slug, { modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail'] }).catch(() => null)
        ]);

        if (!pData || pData.length < 2) return null;
        const pSPrices: number[] = [], pMPrices: number[] = [];
        pData.forEach(d => {
          const dateStr = d.date.toISOString().split('T')[0];
          const mPrice = dateMap.get(dateStr);
          if (mPrice && d.close) { pSPrices.push(d.close); pMPrices.push(mPrice); }
        });

        const pMet = calculateFinancialMetrics(pSPrices, pMPrices);
        const pTradingCurr = pQuote?.currency || 'INR';
        const pFinancialCurr = pFin?.financialData?.financialCurrency || pTradingCurr;
        const pPriceFact = pTradingCurr === 'USD' ? exchangeRate : 1;
        const pFinancialFact = pFinancialCurr === 'USD' ? exchangeRate : 1;

        return {
          ticker: peer.slug,
          name: pQuote?.shortName || peer.slug,
          beta: pMet?.beta ?? null,
          volatility: pMet?.volatility ?? null,
          alpha: pMet?.alpha ?? null,
          correlation: pMet?.correlation ?? null,
          rSquared: pMet?.rSquared ?? null,
          marketCap: (pQuote?.marketCap || 0) * pPriceFact,
          revenue: (pFin?.financialData?.totalRevenue || 0) * pFinancialFact,
          enterpriseValue: (pFin?.defaultKeyStatistics?.enterpriseValue || 0) * pPriceFact,
          evRevenueMultiple: (pFin?.defaultKeyStatistics?.enterpriseValue && pFin?.financialData?.totalRevenue) ? (pFin.defaultKeyStatistics.enterpriseValue / (pFin.financialData.totalRevenue * pFinancialFact / pPriceFact)) : undefined,
          peRatio: pFin?.summaryDetail?.trailingPE,
          pbRatio: pFin?.defaultKeyStatistics?.priceToBook,
          dividendYield: pFin?.summaryDetail?.dividendYield,
          ebitda: (pFin?.financialData?.ebitda || 0) * pFinancialFact,
          debtToEquity: pFin?.financialData?.debtToEquity,
          profitMargin: pFin?.financialData?.profitMargins,
          sector: peer.sector
        };
      }));

      const finalPeers = peerResults.filter(p => p !== null).sort((a, b) => (b?.marketCap || 0) - (a?.marketCap || 0));
      
      await storage.createSearch({
        ticker: fullTicker,
        exchange,
        startDate,
        endDate,
        beta: metrics.beta,
        peers: finalPeers as any
      });

      res.json({ ...targetData, peers: finalPeers });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
