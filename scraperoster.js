const { chromium } = require("playwright");
const fs = require("fs");

const divisions = [
  { name: "Heavyweight", url: "https://www.roster.watch/heavyweight.html", gender: "Men" },
  { name: "Light Heavyweight", url: "https://www.roster.watch/lightheavyweight.html", gender: "Men" },
  { name: "Middleweight", url: "https://www.roster.watch/middleweight.html", gender: "Men" },
  { name: "Welterweight", url: "https://www.roster.watch/welterweight.html", gender: "Men" },
  { name: "Lightweight", url: "https://www.roster.watch/lightweight.html", gender: "Men" },
  { name: "Featherweight", url: "https://www.roster.watch/featherweight.html", gender: "Men" },
  { name: "Bantamweight", url: "https://www.roster.watch/bantamweight.html", gender: "Men" },
  { name: "Flyweight", url: "https://www.roster.watch/flyweight.html", gender: "Men" },
  { name: "Womens Bantamweight", url: "https://www.roster.watch/womensbantamweight.html", gender: "Women" },
  { name: "Womens Flyweight", url: "https://www.roster.watch/womensflyweight.html", gender: "Women" },
  { name: "Womens Strawweight", url: "https://www.roster.watch/womensstrawweight.html", gender: "Women" }
];

const bannedPhrases = [
  "current roster",
  "former roster",
  "weight classes",
  "fight log",
  "random page",
  "support on patreon",
  "become a patron",
  "patreon",
  "ufc fight night",
  "ufc ",
  "women's bantamweight",
  "women's flyweight",
  "women's strawweight",
  "heavyweight",
  "light heavyweight",
  "middleweight",
  "welterweight",
  "lightweight",
  "featherweight",
  "bantamweight",
  "flyweight",
  "ai judge",
  "electronic mail"
];

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function looksLikeFighterName(name) {
  if (!name) return false;

  const cleaned = normalizeText(name);
  const lower = cleaned.toLowerCase();

  if (cleaned.length < 5) return false;

  if (bannedPhrases.some(phrase => lower.includes(phrase))) return false;

  // Must look like a person's name:
  // at least 2 words, each word starts with a letter
  const parts = cleaned.split(" ");
  if (parts.length < 2) return false;
  if (parts.length > 4) return false;

  // Reject obvious event strings with punctuation patterns
  if (cleaned.includes(":")) return false;

  // Reject names with too many non-letter characters
  const weirdCharCount = (cleaned.match(/[^a-zA-ZÀ-ÿ.'\- ]/g) || []).length;
  if (weirdCharCount > 1) return false;

  // Every part should start with a letter
  for (const part of parts) {
    if (!/^[A-Za-zÀ-ÿ]/.test(part)) return false;
  }

  return true;
}

async function scrapeRoster() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let fighters = [];

  for (const division of divisions) {
    console.log(`Scraping ${division.name}`);
    await page.goto(division.url, { waitUntil: "networkidle" });

    const rawNames = await page.$$eval("a", links =>
      links.map(link => (link.textContent || "").trim()).filter(Boolean)
    );

    const filteredNames = rawNames
      .map(name => normalizeText(name))
      .filter(name => looksLikeFighterName(name));

    const divisionFighters = filteredNames.map(name => ({
      name,
      division: division.name,
      gender: division.gender
    }));

    console.log(`${division.name}: ${divisionFighters.length} fighters`);

    fighters.push(...divisionFighters);
  }

  fighters = [...new Map(fighters.map(f => [`${f.name}-${f.division}`, f])).values()];

  fighters.sort((a, b) => {
    const divCompare = a.division.localeCompare(b.division);
    if (divCompare !== 0) return divCompare;
    return a.name.localeCompare(b.name);
  });

  const dataset = {
    scraped_at: new Date().toISOString(),
    fighter_count: fighters.length,
    fighters
  };

  fs.writeFileSync("./ufc_roster.json", JSON.stringify(dataset, null, 2));
  console.log(`Saved ${fighters.length} fighters to ufc_roster.json`);

  await browser.close();
}

scrapeRoster().catch(err => {
  console.error("Scraper failed:", err);
});