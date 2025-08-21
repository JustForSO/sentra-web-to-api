import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * 从环境变量读取代理配置并返回 Node.js 的 Agent（或 null）。
 * 支持的环境变量（优先级从高到低）：
 * - AI_PROXY_URL
 * - HTTPS_PROXY
 * - HTTP_PROXY
 * - ALL_PROXY
 * 同时支持 NO_PROXY（或 no_proxy），用于配置不走代理的域名列表，逗号分隔。
 *
 * 用法：
 *   const agent = getProxyAgent('https://api.example.com');
 *   await fetch('https://api.example.com', { agent });
 *
 * @param {string} targetUrl 用于匹配 NO_PROXY 的目标 URL，可为空
 * @returns {import('http').Agent | import('https').Agent | null}
 */
export function getProxyAgent(targetUrl = '') {
  try {
    const proxyUrl = process.env.AI_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    if (!proxyUrl) return null;

    // Respect NO_PROXY: a comma-separated list of hosts/domains to bypass
    const noProxy = (process.env.NO_PROXY || process.env.no_proxy || '').split(',').map(s => s.trim()).filter(Boolean);
    if (targetUrl && noProxy.length > 0) {
      try {
        const { hostname } = new URL(targetUrl);
        if (hostname && noProxy.some(entry => hostname.endsWith(entry))) {
          return null;
        }
      } catch (_) {
        // Ignore URL parse errors and proceed with proxy
      }
    }

    /**
     * 创建代理 Agent 实例
     */
    return new HttpsProxyAgent(proxyUrl);
  } catch (_) {
    return null;
  }
}
