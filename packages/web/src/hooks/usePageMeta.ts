import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_NAME = "KAI Bundestag";
const BASE_URL = "https://bundestag.easingthemes.com";

interface PageMeta {
  title: string;
  description?: string;
  /** Override og:type (default: "website") */
  ogType?: string;
}

/**
 * Sets document title, meta description, canonical URL, and Open Graph tags
 * for the current page. Resets to defaults on unmount.
 */
export function usePageMeta({ title, description, ogType }: PageMeta) {
  const { pathname } = useLocation();

  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`;
    document.title = fullTitle;

    setMeta("description", description);
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", `${BASE_URL}${pathname}`, "property");
    if (ogType) setMeta("og:type", ogType, "property");
    setMeta("twitter:title", fullTitle, "name");
    setMeta("twitter:description", description, "name");

    // Update canonical link
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) {
      link.href = `${BASE_URL}${pathname}`;
    }

    return () => {
      document.title = SITE_NAME;
    };
  }, [title, description, pathname, ogType]);
}

function setMeta(key: string, value: string | undefined, attr: "name" | "property" = "name") {
  if (!value) return;
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}
