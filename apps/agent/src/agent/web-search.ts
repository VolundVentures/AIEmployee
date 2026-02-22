/**
 * Web search implementation.
 * Uses DuckDuckGo Instant Answer API (free, no key needed) as default.
 * Can be upgraded to Brave Search, Serper, etc. by setting SEARCH_API_KEY.
 */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search using DuckDuckGo Instant Answer API (free, no API key).
 * Returns structured results.
 */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const response = await fetch(url);
    const data = (await response.json()) as Record<string, any>;
    const results: SearchResult[] = [];

    // Abstract (main answer)
    if (data.Abstract) {
      results.push({
        title: (data.Heading as string) || query,
        url: (data.AbstractURL as string) || "",
        snippet: data.Abstract as string,
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of (data.RelatedTopics as any[]).slice(0, 5)) {
        if (topic.Text) {
          results.push({
            title: (topic.Text as string).slice(0, 80),
            url: (topic.FirstURL as string) || "",
            snippet: topic.Text as string,
          });
        }
      }
    }

    // If no structured results, return the answer text
    if (results.length === 0 && data.Answer) {
      results.push({
        title: query,
        url: "",
        snippet: data.Answer as string,
      });
    }

    return results;
  } catch (err) {
    console.error("[WebSearch] DuckDuckGo error:", err);
    return [];
  }
}

/**
 * Search using Brave Search API (requires BRAVE_SEARCH_API_KEY).
 */
async function searchBrave(query: string, apiKey: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      }
    );

    const data = (await response.json()) as Record<string, any>;
    return ((data.web?.results || []) as any[]).slice(0, 5).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  } catch (err) {
    console.error("[WebSearch] Brave error:", err);
    return [];
  }
}

/**
 * Main search function. Routes to available provider.
 */
export async function webSearch(query: string): Promise<string> {
  console.log(`[WebSearch] Searching: "${query}"`);

  let results: SearchResult[];

  // Use Brave if API key is available, otherwise fall back to DuckDuckGo
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    results = await searchBrave(query, braveKey);
  } else {
    results = await searchDuckDuckGo(query);
  }

  if (results.length === 0) {
    return `No search results found for "${query}". Try a different query or use your existing knowledge to answer.`;
  }

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}${r.url ? `\n   Source: ${r.url}` : ""}`)
    .join("\n\n");

  return `Search results for "${query}":\n\n${formatted}`;
}
