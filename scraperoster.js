const { chromium } = require("playwright");
const fs = require("fs");

const ROSTER_URL = "https://www.roster.watch/";

/*
  roster.watch currently exposes 18 values in each fighter row:

  0  fighter
  1  country
  2  age / date of birth
  3  gender
  4  weight class
  5  peak divisional rank
  6  peak pound-for-pound rank
  7  UFC bouts
  8  wins + win method breakdown
  9  losses + loss method breakdown
  10 current streak
  11 best streak
  12 bonuses
  13 average card slot
  14 peak Elo
  15 average opponent Elo
  16 UFC debut
  17 most recent / previous fight

  The scraper keeps the original cell text and also converts the more useful
  fields into cleaner values for your application.
*/

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  const cleaned = normalizeText(value);

  if (!cleaned) {
    return null;
  }

  const number = Number(cleaned);
  return Number.isNaN(number) ? null : number;
}

function integerOrNull(value) {
  const cleaned = normalizeText(value);

  if (!cleaned) {
    return null;
  }

  const number = parseInt(cleaned, 10);
  return Number.isNaN(number) ? null : number;
}

/*
  Example:
  "24 (2001-10-10)"

  becomes:
  {
    age: 24,
    date_of_birth: "2001-10-10"
  }
*/
function parseAge(value) {
  const cleaned = normalizeText(value);

  if (!cleaned) {
    return {
      age: null,
      date_of_birth: null,
      raw: ""
    };
  }

  const ageMatch = cleaned.match(/^(\d+)/);
  const dobMatch = cleaned.match(/\((\d{4}-\d{2}-\d{2})\)/);

  return {
    age: ageMatch ? Number(ageMatch[1]) : null,
    date_of_birth: dobMatch ? dobMatch[1] : null,
    raw: cleaned
  };
}

/*
  Example:
  "11 5 KO 2 Sub 4 Dec"

  becomes:
  {
    total: 11,
    ko_tko: 5,
    submissions: 2,
    decisions: 4
  }
*/
function parseRecordBreakdown(value) {
  const cleaned = normalizeText(value);

  if (!cleaned) {
    return {
      total: null,
      ko_tko: null,
      submissions: null,
      decisions: null,
      raw: ""
    };
  }

  const totalMatch = cleaned.match(/^(-?\d+)/);
  const koMatch = cleaned.match(/(\d+)\s+KO/i);
  const subMatch = cleaned.match(/(\d+)\s+Sub/i);
  const decMatch = cleaned.match(/(\d+)\s+Dec/i);

  return {
    total: totalMatch ? Number(totalMatch[1]) : null,
    ko_tko: koMatch ? Number(koMatch[1]) : null,
    submissions: subMatch ? Number(subMatch[1]) : null,
    decisions: decMatch ? Number(decMatch[1]) : null,
    raw: cleaned
  };
}

/*
  Example:
  "2026-06-14 W - Alex Pereira"

  becomes:
  {
    date: "2026-06-14",
    result: "W",
    opponent: "Alex Pereira"
  }
*/
function parseFight(value) {
  const cleaned = normalizeText(value);

  if (!cleaned) {
    return {
      date: null,
      result: null,
      opponent: null,
      raw: ""
    };
  }

  const match = cleaned.match(
    /^(\d{4}-\d{2}-\d{2})\s*(W|L|D|NC)\s*-\s*(.+)$/i
  );

  if (!match) {
    return {
      date: null,
      result: null,
      opponent: null,
      raw: cleaned
    };
  }

  return {
    date: match[1],
    result: match[2].toUpperCase(),
    opponent: normalizeText(match[3]),
    raw: cleaned
  };
}

function normalizeGender(value) {
  const cleaned = normalizeText(value);

  if (cleaned.includes("♂")) {
    return "Men";
  }

  if (cleaned.includes("♀")) {
    return "Women";
  }

  return cleaned || null;
}

async function scrapeRoster() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log("Opening roster.watch...");
    await page.goto(ROSTER_URL, { waitUntil: "domcontentloaded" });

    // Wait until at least one actual fighter row is present.
    await page.waitForSelector('tbody tr a[href*="/fighters/"]', {
      timeout: 15000
    });

    /*
      Instead of scraping every <a> tag on the page, we scrape table rows.

      For each row:
      - get every <td> cell
      - find the fighter link
      - keep the fighter's clean name
      - keep the full text of every table cell
      - keep the fighter detail-page URL
    */
    const rawRows = await page.$$eval("tbody tr", rows => {
      const clean = value =>
        (value || "").replace(/\s+/g, " ").trim();

      return rows
        .map(row => {
          const fighterLink = row.querySelector('a[href*="/fighters/"]');

          if (!fighterLink) {
            return null;
          }

          const cells = Array.from(row.querySelectorAll("td")).map(cell =>
            clean(cell.innerText || cell.textContent)
          );

          // A real roster row currently has 18 data cells.
          if (cells.length < 18) {
            return null;
          }

          return {
            name: clean(fighterLink.textContent),
            fighter_url: fighterLink.href,
            cells
          };
        })
        .filter(Boolean);
    });

    const fighters = rawRows.map(row => {
      const cells = row.cells;

      const ageInfo = parseAge(cells[2]);
      const wins = parseRecordBreakdown(cells[8]);
      const losses = parseRecordBreakdown(cells[9]);
      const debut = parseFight(cells[16]);
      const lastFight = parseFight(cells[17]);

      return {
        // Fighter identity
        name: row.name,

        /*
          The full first-cell text is kept because roster.watch sometimes
          displays extra labels/badges beside a fighter's name, such as "CS".
        */
        fighter_label: cells[0],
        fighter_url: row.fighter_url,

        // Basic information
        country: cells[1] || null,
        age: ageInfo.age,
        date_of_birth: ageInfo.date_of_birth,
        age_raw: ageInfo.raw,
        gender: normalizeGender(cells[3]),
        gender_raw: cells[3] || null,

        /*
          Some fighters appear in more than one weight class, so storing this
          as an array is more useful than assuming one division.
        */
        weight_classes: cells[4]
          ? cells[4]
              .split(",")
              .map(value => normalizeText(value))
              .filter(Boolean)
          : [],

        // Rankings
        peak_rank: cells[5] || null,
        peak_p4p_rank: cells[6] || null,

        // UFC record
        ufc_bouts: integerOrNull(cells[7]),
        wins,
        losses,

        // Streaks and bonuses
        current_streak: integerOrNull(cells[10]),
        best_streak: integerOrNull(cells[11]),
        bonuses: integerOrNull(cells[12]),

        // Placement / Elo statistics
        average_card_slot: numberOrNull(cells[13]),
        peak_elo: integerOrNull(cells[14]),
        average_opponent_elo: integerOrNull(cells[15]),

        // Fight history summary
        debut,
        last_fight: lastFight,

        /*
          This preserves the entire original row exactly as scraped.
          If roster.watch later adds a value you have not parsed yet, you still
          have the source row available in the JSON.
        */
        raw_columns: cells
      };
    });

    /*
      The main roster page should already contain one row per fighter.
      This extra de-duplication protects against accidental repeated rows.
    */
    const uniqueFighters = [
      ...new Map(
        fighters.map(fighter => [
          fighter.fighter_url || fighter.name.toLowerCase(),
          fighter
        ])
      ).values()
    ];

    uniqueFighters.sort((a, b) => a.name.localeCompare(b.name));

    const dataset = {
      scraped_at: new Date().toISOString(),
      source: ROSTER_URL,
      fighter_count: uniqueFighters.length,
      fighters: uniqueFighters
    };

    fs.writeFileSync(
      "./ufc_roster.json",
      JSON.stringify(dataset, null, 2),
      "utf8"
    );

    console.log(
      `Saved ${uniqueFighters.length} fighters to ufc_roster.json`
    );
  } finally {
    await browser.close();
  }
}

scrapeRoster().catch(error => {
  console.error("Scraper failed:", error);
  process.exitCode = 1;
});