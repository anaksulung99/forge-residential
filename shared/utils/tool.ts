export interface FeatureTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  badgeColor?: string;
  category: "proxy" | "fingerprint";
  color: string;
  status: "active" | "inactive";
  url: string;
}
export const FEATURE_TOOLS_CATALOG: FeatureTool[] = [
  {
    id: "proxy-scraper",
    name: "Proxy Scraper",
    description: "Scrape a proxy from a website",
    icon: "material-symbols:vpn-googleone",
    badgeColor: "green",
    category: "proxy",
    color: "green",
    status: "active",
    url: "/app/tools/proxy-scraper",
  },
  {
    id: "proxy-checker",
    name: "Proxy Checker",
    description: "Check the validity of a proxy",
    icon: "material-symbols:check-circle-unread-rounded",
    badgeColor: "green",
    category: "proxy",
    color: "green",
    status: "active",
    url: "/app/tools/proxy-checker",
  },
];
