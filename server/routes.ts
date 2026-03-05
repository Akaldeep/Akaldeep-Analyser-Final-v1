import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import YahooFinance from 'yahoo-finance2';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import path from 'path';

// Yahoo Finance blocks datacenter IPs (Railway, AWS etc.) without browser headers
const yf = new YahooFinance({
  fetchOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0',
    },
  },
  suppressNotices: ['yahooSurvey'],
});


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

async function fetchHistoricalData(ticker: string, startDate: string, endDate: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await yf.historical(ticker, {
        period1: new Date(startDate),
        period2: new Date(endDate),
        interval: '1d'
      });
      if (result && result.length > 0) return result;
      if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1000));
    } catch (error) {
      console.error(`Error fetching data for ${ticker} (attempt ${attempt}/${retries}):`, error);
      if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  return null;
}

async function getPeers(ticker: string, exchange: string, exchangeRate: number): Promise<{ slug: string; sector: string; industry: string; marketCap: number }[]> {
  try {
    const summary = await yf.quoteSummary(ticker, { modules: ['assetProfile', 'summaryDetail'] }).catch(() => null);
    if (!summary?.assetProfile) return [];

    const targetIndustry = summary.assetProfile.industry || "";
    const targetSuffix = exchange === "NSE" ? ".NS" : ".BO"; // always use same exchange as target
    const tickerBase = ticker.split('.')[0];
    const excelMatch = industryList.find(i => i.symbol === tickerBase);
    const excelIndustry = excelMatch?.industry;

    // Collect raw candidates — may have mixed .NS/.BO/.BO duplicates
    let rawCandidates: string[] = [];
    const recommendations = await yf.recommendationsBySymbol(ticker).catch(() => null);
    rawCandidates = recommendations?.recommendedSymbols?.map((r: any) => r.symbol) || [];

    if (excelIndustry) {
      const industryPeers = industryList
        .filter(item => item.industry === excelIndustry && item.symbol !== tickerBase)
        .map(item => `${item.symbol}${targetSuffix}`);
      rawCandidates = [...rawCandidates, ...industryPeers];
    }

    // DEDUPLICATE by base symbol — if both INFY.NS and INFY.BO appear, keep only targetSuffix version
    const seenBases = new Set<string>();
    const candidateSymbols: string[] = [];
    for (const sym of rawCandidates) {
      const base = sym.split('.')[0];
      if (base === tickerBase) continue; // skip self
      if (seenBases.has(base)) continue; // skip duplicate exchange
      seenBases.add(base);
      // Normalize to same exchange as the target stock
      candidateSymbols.push(`${base}${targetSuffix}`);
    }

    const peerSummaries = await Promise.all(
      candidateSymbols.slice(0, 20).map(s => yf.quoteSummary(s, { modules: ['assetProfile', 'summaryDetail', 'financialData'] }).catch(() => null))
    );

    const verifiedPeers = await Promise.all(candidateSymbols.slice(0, 20).map(async (symbol, i) => {
      const s = peerSummaries[i];
      if (!s?.assetProfile) return null;

      const symbolBase = symbol.split('.')[0];
      const isSameIndustry = s.assetProfile.industry === targetIndustry ||
        (excelIndustry && industryList.find(item => item.symbol === symbolBase)?.industry === excelIndustry);
      if (!isSameIndustry) return null;

      const quote = await yf.quote(symbol).catch(() => null);
      const peerCurrency = quote?.currency || s.financialData?.financialCurrency || 'INR';
      const peerConversionFactor = peerCurrency === 'USD' ? exchangeRate : 1;
      const peerMarketCap = (s.summaryDetail?.marketCap || 0) * peerConversionFactor;

      return {
        slug: symbol,
        sector: `${s.assetProfile.sector || 'Unknown'} > ${s.assetProfile.industry || 'Unknown'}`,
        industry: s.assetProfile.industry || 'Unknown',
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
  // Market overview: live Nifty/Sensex + financial news
  app.get('/api/market/overview', async (req, res) => {
    try {
      const [nifty, sensex, newsData] = await Promise.all([
        yf.quote('^NSEI').catch(() => null),
        yf.quote('^BSESN').catch(() => null),
        yf.search('India stock market NSE BSE', { newsCount: 12, enableFuzzyQuery: false }).catch(() => null),
      ]);
      res.json({
        indices: {
          nifty50: nifty ? {
            price: nifty.regularMarketPrice,
            change: nifty.regularMarketChange,
            changePercent: nifty.regularMarketChangePercent,
            prevClose: nifty.regularMarketPreviousClose,
          } : null,
          sensex: sensex ? {
            price: sensex.regularMarketPrice,
            change: sensex.regularMarketChange,
            changePercent: sensex.regularMarketChangePercent,
            prevClose: sensex.regularMarketPreviousClose,
          } : null,
        },
        news: ((newsData as any)?.news || []).slice(0, 12).map((n: any) => ({
          title: n.title,
          publisher: n.publisher,
          link: n.link,
          providerPublishTime: n.providerPublishTime,
        })),
      });
    } catch (err) {
      console.error('Market overview error:', err);
      res.status(500).json({ message: 'Failed to fetch market data' });
    }
  });

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
        yf.quoteSummary(fullTicker, { modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'assetProfile'] }).catch(() => null),
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

      // Fetch asset profile for industry/sector info

      const targetData = {
        ticker: fullTicker,
        name: quote?.longName || quote?.shortName || ticker,
        marketIndex: exchange === "NSE" ? "NIFTY 50" : "BSE SENSEX",
        industry: financials?.assetProfile?.industry || null,
        sector: financials?.assetProfile?.sector || null,
        exchange,
        beta: metrics.beta,
        volatility: metrics.volatility,
        alpha: metrics.alpha,
        correlation: metrics.correlation,
        rSquared: metrics.rSquared,
        period: period || "5Y",
        dataPoints: sPrices.length,
        marketCap: (quote?.marketCap || 0) * priceFactor,
        revenue: (financials?.financialData?.totalRevenue || 0) * financialFactor,
        enterpriseValue: (financials?.defaultKeyStatistics?.enterpriseValue || 0) * priceFactor,
        evRevenueMultiple: (financials?.defaultKeyStatistics?.enterpriseValue && financials?.financialData?.totalRevenue) ? (financials.defaultKeyStatistics.enterpriseValue / (financials.financialData.totalRevenue * financialFactor / priceFactor)) : undefined,
        peRatio: financials?.summaryDetail?.trailingPE ?? null,
        pbRatio: financials?.defaultKeyStatistics?.priceToBook ?? null,
        dividendYield: financials?.summaryDetail?.dividendYield ?? null,
        ebitda: (financials?.financialData?.ebitda || 0) * financialFactor,
        // Use ?? null (not || null) so that genuine 0 values are preserved
        debtToEquity: financials?.financialData?.debtToEquity ?? null,
        profitMargin: financials?.financialData?.profitMargins ?? null,
        grossMargin: (financials?.financialData as any)?.grossMargins ?? null,
        operatingMargin: (financials?.financialData as any)?.operatingMargins ?? null,
        returnOnEquity: (financials?.financialData as any)?.returnOnEquity ?? null,
        returnOnAssets: (financials?.financialData as any)?.returnOnAssets ?? null,
        currentRatio: (financials?.financialData as any)?.currentRatio ?? null,
        sourceUrl: `https://finance.yahoo.com/quote/${fullTicker}`,
      };

      const peerList = await getPeers(fullTicker, exchange, exchangeRate);
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
          industry: peer.industry,
          beta: pMet?.beta ?? null,
          volatility: pMet?.volatility ?? null,
          alpha: pMet?.alpha ?? null,
          correlation: pMet?.correlation ?? null,
          rSquared: pMet?.rSquared ?? null,
          marketCap: (pQuote?.marketCap || 0) * pPriceFact,
          revenue: (pFin?.financialData?.totalRevenue || 0) * pFinancialFact,
          enterpriseValue: (pFin?.defaultKeyStatistics?.enterpriseValue || 0) * pPriceFact,
          evRevenueMultiple: (pFin?.defaultKeyStatistics?.enterpriseValue && pFin?.financialData?.totalRevenue) ? (pFin.defaultKeyStatistics.enterpriseValue / (pFin.financialData.totalRevenue * pFinancialFact / pPriceFact)) : undefined,
          peRatio: pFin?.summaryDetail?.trailingPE ?? null,
          pbRatio: pFin?.defaultKeyStatistics?.priceToBook ?? null,
          dividendYield: pFin?.summaryDetail?.dividendYield ?? null,
          ebitda: (pFin?.financialData?.ebitda || 0) * pFinancialFact,
          // Use ?? null so genuine 0 values (e.g. zero-debt companies) are preserved
          debtToEquity: pFin?.financialData?.debtToEquity ?? null,
          profitMargin: pFin?.financialData?.profitMargins ?? null,
          grossMargin: (pFin?.financialData as any)?.grossMargins ?? null,
          operatingMargin: (pFin?.financialData as any)?.operatingMargins ?? null,
          returnOnEquity: (pFin?.financialData as any)?.returnOnEquity ?? null,
          returnOnAssets: (pFin?.financialData as any)?.returnOnAssets ?? null,
          currentRatio: (pFin?.financialData as any)?.currentRatio ?? null,
          sector: peer.sector,
          sourceUrl: `https://finance.yahoo.com/quote/${peer.slug}`,
        };
      }));

      // Filter: remove nulls AND peers with no market cap data (bad Yahoo Finance returns)
      const finalPeers = peerResults
        .filter((p): p is NonNullable<typeof p> => p !== null && p.marketCap > 0)
        .sort((a, b) => b.marketCap - a.marketCap);
      
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
