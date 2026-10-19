// Job feed for the careers pages. Roles live in a Google Sheet (Title, Department,
// Location, Status, Doc ID, Slug) served by an Apps Script web app; each role's
// description is a publicly viewable Google Doc.

export type JobRow = {
  title: string;
  department: string;
  location: string;
  status: string;
  docId: string;
  slug: string;
};

export type CareersConfig = {
  jobsSheetId?: string;
  appsScriptUrl?: string;
};

type AppsScriptJob = {
  Title?: string;
  Department?: string;
  Location?: string;
  Status?: string;
  "Doc ID"?: string;
  Slug?: string;
};

// Public identifiers (the browser fetches them directly), so they ship as defaults;
// env vars still override them per deployment.
const DEFAULT_JOBS_SHEET_ID = "1DgKdBuZp3C4lmWgZIeqUSKO38TAVjmg4vV-pPKSkggM";
const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxtWzWDVrTHvfpF83s_Y2Ac0b6lKGsKMRjzfccn_Lfug8G0712-Oi9msP2U0I3sGUpX/exec";

/** Server-side only: reads env vars, falling back to the defaults above. */
export function getCareersConfig(): CareersConfig {
  return {
    jobsSheetId: process.env.VITE_JOBS_SHEET_ID || DEFAULT_JOBS_SHEET_ID,
    appsScriptUrl: process.env.VITE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL,
  };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseJobsCsv(csv: string): JobRow[] {
  const [header = [], ...rows] = parseCsv(csv);
  const keyMap = header.map((key) => key.toLowerCase());

  const value = (row: string[], label: string) => row[keyMap.indexOf(label.toLowerCase())] ?? "";

  return rows.map((row) => ({
    title: value(row, "Title"),
    department: value(row, "Department"),
    location: value(row, "Location"),
    status: value(row, "Status"),
    docId: value(row, "Doc ID"),
    slug: value(row, "Slug"),
  }));
}

function normalizeJob(row: AppsScriptJob): JobRow {
  return {
    title: row.Title ?? "",
    department: row.Department ?? "",
    location: row.Location ?? "",
    status: row.Status ?? "",
    docId: row["Doc ID"] ?? "",
    slug: row.Slug ?? "",
  };
}

function isOpen(job: JobRow) {
  return Boolean(job.slug && job.title) && (!job.status || job.status.toLowerCase() === "open");
}

/** Open roles from the Apps Script feed, or the sheet's CSV export when no script URL is set. */
export async function fetchOpenJobs(config: CareersConfig, init?: RequestInit): Promise<JobRow[]> {
  if (!config.appsScriptUrl && !config.jobsSheetId) {
    throw new Error("Missing VITE_APPS_SCRIPT_URL or VITE_JOBS_SHEET_ID.");
  }

  const jobs = config.appsScriptUrl
    ? await fetch(config.appsScriptUrl, init)
        .then((response) => {
          if (!response.ok) throw new Error("Could not fetch the jobs index.");
          return response.json() as Promise<AppsScriptJob[]>;
        })
        .then((rows) => rows.map(normalizeJob))
    : await fetch(`https://docs.google.com/spreadsheets/d/${config.jobsSheetId}/export?format=csv`, init)
        .then((response) => {
          if (!response.ok) throw new Error("Could not fetch the jobs index.");
          return response.text();
        })
        .then(parseJobsCsv);

  return jobs.filter(isOpen);
}

/** For server components: cached for 5 minutes; an unreachable feed renders as no open roles. */
export async function loadOpenJobs(): Promise<JobRow[]> {
  try {
    return await fetchOpenJobs(getCareersConfig(), { next: { revalidate: 300 } });
  } catch {
    return [];
  }
}
