import getUserAgent from "./get-user-agent.js";

/**
 * Generate headers
 *
 * @param   {Boolean}  proxy       Use proxy flag
 * @param   {Object}  proxyAgent  Proxy agent
 *
 * @return  {Object}              Headers
 */
export function getHeaders(proxy = false, proxyAgent = false) {
    return {
        agent: proxy ? proxyAgent : false,
        "user-agent": getUserAgent(),
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        ...(Math.round(Math.random())
            ? {
                  downlink: Math.floor(Math.random() * 30) + 10,
              }
            : {}),
        ...(Math.round(Math.random())
            ? {
                  rtt: Math.floor(Math.random() * 100) + 50,
              }
            : {}),
        ...(Math.round(Math.random())
            ? {
                  pragma: "no-cache",
              }
            : {}),
        ...(Math.round(Math.random())
            ? {
                  ect: "4g",
              }
            : {}),
        ...(Math.round(Math.random())
            ? {
                  DNT: 1,
              }
            : {}),
    };
}

export default getHeaders;
