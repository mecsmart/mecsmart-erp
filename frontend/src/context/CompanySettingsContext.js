import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, useAuth } from './AuthContext';

const CompanySettingsContext = createContext(null);

const CURRENCY_MAP = {
  INR: { symbol: '₹', code: 'INR', locale: 'en-IN' },
  USD: { symbol: '$', code: 'USD', locale: 'en-US' },
};

export function CompanySettingsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [companySettings, setCompanySettings] = useState(null);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/api/settings/company');
      setCompanySettings(data);
    } catch {
      // not logged in or fetch failed
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchSettings();
  }, [isAuthenticated, fetchSettings]);

  const primaryCurrency = companySettings?.primary_currency || 'INR';
  const secondaryCurrency = companySettings?.secondary_currency || 'USD';
  const currencyInfo = CURRENCY_MAP[primaryCurrency] || CURRENCY_MAP.INR;
  const secondaryCurrencyInfo = CURRENCY_MAP[secondaryCurrency] || CURRENCY_MAP.USD;

  const formatCurrency = useCallback((amount, currencyOverride) => {
    const cur = CURRENCY_MAP[currencyOverride] || currencyInfo;
    const num = Number(amount);
    if (isNaN(num)) return `${cur.symbol}0.00`;
    return `${cur.symbol}${num.toLocaleString(cur.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [currencyInfo]);

  const getCurrencySymbol = useCallback((currencyOverride) => {
    return (CURRENCY_MAP[currencyOverride] || currencyInfo).symbol;
  }, [currencyInfo]);

  const value = {
    companySettings,
    setCompanySettings,
    refreshSettings: fetchSettings,
    primaryCurrency,
    secondaryCurrency,
    currencySymbol: currencyInfo.symbol,
    secondaryCurrencySymbol: secondaryCurrencyInfo.symbol,
    formatCurrency,
    getCurrencySymbol,
    CURRENCY_MAP,
  };

  return (
    <CompanySettingsContext.Provider value={value}>
      {children}
    </CompanySettingsContext.Provider>
  );
}

export function useCompanySettings() {
  const context = useContext(CompanySettingsContext);
  if (!context) {
    throw new Error('useCompanySettings must be used within CompanySettingsProvider');
  }
  return context;
}
