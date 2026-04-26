"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type JobRow = {
  title: string;
  department: string;
  location: string;
  status: string;
  docId: string;
  slug: string;
};

type AppsScriptJob = {
  Title?: string;
  Department?: string;
  Location?: string;
  Status?: string;
  "Doc ID"?: string;
  Slug?: string;
};

type EducationRow = {
  school: string;
  degree: string;
  discipline: string;
};

type FormState = {
  firstName: string;
  lastName: string;
  preferredFirstName: string;
  email: string;
  phone: string;
  country: string;
  phoneNumber: string;
  locationCity: string;
  fullLegalName: string;
  legalLocation: string;
  website: string;
  linkedin: string;
  xProfile: string;
  idealCandidateAnswer: string;
  proudWorkAnswer: string;
  visaSponsorship: string;
};

type Config = {
  jobsSheetId?: string;
  appsScriptUrl?: string;
};

type Props = Config & {
  jobSlug?: string;
};

type ViteImportMeta = ImportMeta & {
  env?: Record<string, string | undefined>;
};

const sectionNames = [
  "About Fauward",
  "About the Role",
  "Responsibilities",
  "Basic Qualifications",
  "Preferred Skills",
  "Equal Opportunity",
];

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  preferredFirstName: "",
  email: "",
  phone: "",
  country: "",
  phoneNumber: "",
  locationCity: "",
  fullLegalName: "",
  legalLocation: "",
  website: "",
  linkedin: "",
  xProfile: "",
  idealCandidateAnswer: "",
  proudWorkAnswer: "",
  visaSponsorship: "",
};

const emptyEducation: EducationRow = {
  school: "",
  degree: "",
  discipline: "",
};

function readEnv(): Config {
  const viteEnv = (import.meta as ViteImportMeta).env;
  const runtimeConfig =
    typeof window !== "undefined"
      ? (window as Window & { __FAUWARD_CAREERS_CONFIG__?: Config }).__FAUWARD_CAREERS_CONFIG__
      : undefined;

  return {
    jobsSheetId: runtimeConfig?.jobsSheetId ?? viteEnv?.VITE_JOBS_SHEET_ID,
    appsScriptUrl: runtimeConfig?.appsScriptUrl ?? viteEnv?.VITE_APPS_SCRIPT_URL,
  };
}

function getSlugFromLocation() {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
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
  const [header, ...rows] = parseCsv(csv);
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

function readFileAsBase64(file: File | null) {
  if (!file) return Promise.resolve("");

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.readAsDataURL(file);
  });
}

function normalizeHeading(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function sanitizeHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowedTags = new Set(["P", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "A", "BR"]);

  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "");
    if (!(node instanceof HTMLElement)) return null;

    if (!allowedTags.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      node.childNodes.forEach((child) => {
        const cleaned = cleanNode(child);
        if (cleaned) fragment.appendChild(cleaned);
      });
      return fragment;
    }

    const element = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? "";
      if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
        element.setAttribute("href", href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noreferrer");
      }
    }

    node.childNodes.forEach((child) => {
      const cleaned = cleanNode(child);
      if (cleaned) element.appendChild(cleaned);
    });
    return element;
  };

  const fragment = document.createDocumentFragment();
  template.content.childNodes.forEach((child) => {
    const cleaned = cleanNode(child);
    if (cleaned) fragment.appendChild(cleaned);
  });

  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

function parseGoogleDocSections(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sections = new Map<string, string>();
  let activeSection: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (activeSection && buffer.length) {
      sections.set(activeSection, sanitizeHtml(buffer.join("")));
    }
    buffer = [];
  };

  Array.from(doc.body.children).forEach((element) => {
    const isHeading = /^H[1-6]$/.test(element.tagName);
    const matchedSection = isHeading
      ? sectionNames.find((name) => normalizeHeading(element.textContent ?? "").startsWith(normalizeHeading(name)))
      : undefined;

    if (matchedSection) {
      flush();
      activeSection = matchedSection;
      return;
    }

    if (activeSection) buffer.push(element.outerHTML);
  });

  flush();
  return sectionNames
    .map((name) => ({ name, html: sections.get(name) }))
    .filter((section): section is { name: string; html: string } => Boolean(section.html));
}

function JobSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading job description">
      <div className="space-y-3">
        <div className="h-4 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-12 w-4/5 animate-pulse rounded bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-8 w-28 animate-pulse rounded-full bg-gray-200" />
          <div className="h-8 w-36 animate-pulse rounded-full bg-gray-200" />
        </div>
      </div>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="space-y-3">
          <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold text-gray-900">
      {children}
      {required ? <span className="text-amber-600"> *</span> : null}
    </label>
  );
}

function inputClasses(hasError?: boolean) {
  return [
    "h-11 w-full rounded-md border bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
    hasError ? "border-red-500" : "border-gray-300",
  ].join(" ");
}

function textareaClasses(hasError?: boolean) {
  return [
    "min-h-[132px] w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
    hasError ? "border-red-500" : "border-gray-300",
  ].join(" ");
}

export default function CareersJobListingPage({ jobSlug, jobsSheetId, appsScriptUrl }: Props) {
  const [job, setJob] = useState<JobRow | null>(null);
  const [sections, setSections] = useState<Array<{ name: string; html: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [education, setEducation] = useState<EducationRow[]>([{ ...emptyEducation }]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const applyRef = useRef<HTMLDivElement>(null);

  const env = useMemo(readEnv, []);
  const resolvedJobsSheetId = jobsSheetId ?? env.jobsSheetId;
  const resolvedAppsScriptUrl = appsScriptUrl ?? env.appsScriptUrl;
  const resolvedSlug = jobSlug ?? getSlugFromLocation();

  useEffect(() => {
    let cancelled = false;

    async function loadJob() {
      setLoading(true);
      setLoadError("");

      try {
        if (!resolvedAppsScriptUrl && !resolvedJobsSheetId) {
          throw new Error("Missing VITE_APPS_SCRIPT_URL or VITE_JOBS_SHEET_ID.");
        }
        if (!resolvedSlug) throw new Error("Missing job slug.");

        const openJobs = resolvedAppsScriptUrl
          ? await fetch(resolvedAppsScriptUrl)
              .then((response) => {
                if (!response.ok) throw new Error("Could not fetch the jobs index.");
                return response.json() as Promise<AppsScriptJob[]>;
              })
              .then((rows) => rows.map(normalizeJob))
          : await fetch(`https://docs.google.com/spreadsheets/d/${resolvedJobsSheetId}/export?format=csv`)
              .then((response) => {
                if (!response.ok) throw new Error("Could not fetch the jobs index.");
                return response.text();
              })
              .then((csv) => parseJobsCsv(csv).filter((row) => row.status.toLowerCase() === "open"));
        const matchedJob = openJobs.find((row) => row.slug === resolvedSlug);
        if (!matchedJob) throw new Error("This role is not currently open.");

        const docResponse = await fetch(
          `https://docs.google.com/document/d/${matchedJob.docId}/export?format=html`,
        );
        if (!docResponse.ok) throw new Error("Could not fetch the job description.");

        const parsedSections = parseGoogleDocSections(await docResponse.text());
        if (!cancelled) {
          setJob(matchedJob);
          setSections(parsedSections);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "We could not load this role right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadJob();
    return () => {
      cancelled = true;
    };
  }, [resolvedAppsScriptUrl, resolvedJobsSheetId, resolvedSlug]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    const required: Array<[keyof FormState, string]> = [
      ["firstName", "First name is required."],
      ["lastName", "Last name is required."],
      ["email", "Email is required."],
      ["country", "Country is required."],
      ["phoneNumber", "Phone number is required."],
      ["locationCity", "Location is required."],
      ["fullLegalName", "Full legal name is required."],
      ["legalLocation", "Your location is required."],
      ["idealCandidateAnswer", "This answer is required."],
      ["proudWorkAnswer", "This answer is required."],
      ["visaSponsorship", "Please select an option."],
    ];

    required.forEach(([key, message]) => {
      if (!form[key].trim()) nextErrors[key] = message;
    });
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = "Enter a valid email address.";
    if (!resumeFile) nextErrors.resume = "Resume/CV is required.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!validate()) return;
    if (!resolvedAppsScriptUrl) {
      setSubmitError("Applications are not configured yet. Please contact careers@fauward.com.");
      return;
    }

    setSubmitting(true);
    try {
      const [cvBase64, clBase64] = await Promise.all([
        readFileAsBase64(resumeFile),
        readFileAsBase64(coverLetterFile),
      ]);
      const body = JSON.stringify({
        jobTitle: job?.title ?? resolvedSlug,
        firstName: form.firstName,
        lastName: form.lastName,
        preferredFirstName: form.preferredFirstName,
        email: form.email,
        phone: form.phoneNumber || form.phone,
        country: form.country,
        location: form.locationCity,
        linkedin: form.linkedin,
        website: form.website,
        xProfile: form.xProfile,
        idealCandidate: form.idealCandidateAnswer,
        proudWork: form.proudWorkAnswer,
        visaSponsorship: form.visaSponsorship,
        fullLegalName: form.fullLegalName,
        legalLocation: form.legalLocation,
        education,
        cvBase64,
        cvName: resumeFile?.name ?? "",
        cvMime: resumeFile?.type ?? "application/octet-stream",
        clBase64,
        clName: coverLetterFile?.name ?? "",
        clMime: coverLetterFile?.type ?? "application/octet-stream",
      });

      const response = await fetch(resolvedAppsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
      });

      const result = await response.json().catch(() => null) as { status?: string; message?: string } | null;
      if (!response.ok || result?.status !== "ok") {
        throw new Error("Submission failed.");
      }

      setSubmittedName(form.firstName);
    } catch {
      setSubmitError("We could not submit your application. Please try again or contact careers@fauward.com.");
    } finally {
      setSubmitting(false);
    }
  }

  function scrollToApply() {
    applyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="bg-white">
      {/*
        Deploy a Google Apps Script as a Web App with doGet(e) and doPost(e) handlers:
        - doGet reads open jobs from the Jobs tab and returns JSON
        - doPost parses JSON from e.postData.contents, stores files in Drive, and appends a row
        - Return ContentService JSON with { status: "ok" }
        Set execution as: Me, Access: Anyone
        Paste the deployed Web App URL as VITE_APPS_SCRIPT_URL in .env
      */}
      <div className="marketing-container py-12 lg:py-18">
        <div className="mx-auto max-w-3xl">
          <nav className="mb-8 flex flex-wrap items-center gap-2 text-sm font-medium text-gray-500">
            <a className="transition hover:text-brand-navy" href="/careers">Careers</a>
            <span>/</span>
            <a className="transition hover:text-brand-navy" href="/careers/open-roles">Open Roles</a>
            {job?.title ? (
              <>
                <span>/</span>
                <span className="text-gray-900">{job.title}</span>
              </>
            ) : null}
          </nav>

          {loading ? (
            <JobSkeleton />
          ) : loadError ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <p className="font-semibold text-gray-900">We could not load this job description.</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">{loadError}</p>
              <a className="mt-4 inline-flex text-sm font-semibold text-amber-700 underline" href="mailto:careers@fauward.com">
                Contact HR
              </a>
            </div>
          ) : job ? (
            <>
              <header className="border-b border-gray-200 pb-10">
                <a className="mb-6 inline-flex text-sm font-semibold text-amber-700 hover:text-amber-600" href="/careers/open-roles">
                  Back to open roles
                </a>
                <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl">{job.title}</h1>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">{job.department}</span>
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">{job.location}</span>
                </div>
                <button
                  type="button"
                  onClick={scrollToApply}
                  className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-7 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  Apply
                </button>
              </header>

              <div className="prose prose-gray mt-10 max-w-none">
                {sections.map((section) => (
                  <section key={section.name} className="border-b border-gray-200 py-8 last:border-b-0">
                    <h2 className="mb-4 text-2xl font-bold tracking-tight text-gray-900">{section.name}</h2>
                    <div
                      className="space-y-4 text-base leading-7 text-gray-600 marker:text-amber-600 [&_a]:font-semibold [&_a]:text-amber-700 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-5"
                      dangerouslySetInnerHTML={{ __html: section.html }}
                    />
                  </section>
                ))}
              </div>
            </>
          ) : null}

          <section id="apply" ref={applyRef} className="mt-16 scroll-mt-28 rounded-xl border border-gray-200 bg-gray-50 p-5 sm:p-8">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Application</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">Apply for this role</h2>
            </div>

            {submittedName ? (
              <div className="rounded-xl border border-green-200 bg-white p-6">
                <p className="text-lg font-bold text-gray-900">Thanks {submittedName}, your application has been received.</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">Our team will review it and follow up if there is a strong match.</p>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label required>First Name</Label>
                    <input className={inputClasses(Boolean(errors.firstName))} value={form.firstName} onChange={(event) => updateForm("firstName", event.target.value)} />
                    <FieldError message={errors.firstName} />
                  </div>
                  <div>
                    <Label required>Last Name</Label>
                    <input className={inputClasses(Boolean(errors.lastName))} value={form.lastName} onChange={(event) => updateForm("lastName", event.target.value)} />
                    <FieldError message={errors.lastName} />
                  </div>
                  <div>
                    <Label>Preferred First Name</Label>
                    <input className={inputClasses()} value={form.preferredFirstName} onChange={(event) => updateForm("preferredFirstName", event.target.value)} />
                  </div>
                  <div />
                  <div>
                    <Label required>Email</Label>
                    <input type="email" className={inputClasses(Boolean(errors.email))} value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
                    <FieldError message={errors.email} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <input className={inputClasses()} value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
                  </div>
                  <div>
                    <Label required>Country</Label>
                    <select className={inputClasses(Boolean(errors.country))} value={form.country} onChange={(event) => updateForm("country", event.target.value)}>
                      <option value="">Select country</option>
                      <option>United Kingdom</option>
                      <option>United States</option>
                      <option>Nigeria</option>
                      <option>Kenya</option>
                      <option>United Arab Emirates</option>
                      <option>Other</option>
                    </select>
                    <FieldError message={errors.country} />
                  </div>
                  <div>
                    <Label required>Phone number</Label>
                    <input className={inputClasses(Boolean(errors.phoneNumber))} value={form.phoneNumber} onChange={(event) => updateForm("phoneNumber", event.target.value)} />
                    <FieldError message={errors.phoneNumber} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label required>Location (City)</Label>
                    <input className={inputClasses(Boolean(errors.locationCity))} value={form.locationCity} onChange={(event) => updateForm("locationCity", event.target.value)} />
                    <FieldError message={errors.locationCity} />
                  </div>
                  <FilePicker label="Resume/CV" required file={resumeFile} error={errors.resume} onChange={setResumeFile} />
                  <FilePicker label="Cover Letter" file={coverLetterFile} onChange={setCoverLetterFile} />
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-900">Education</p>
                  {education.map((row, index) => (
                    <div key={index} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-3">
                      <input
                        className={inputClasses()}
                        placeholder="School"
                        value={row.school}
                        onChange={(event) =>
                          setEducation((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, school: event.target.value } : item))
                        }
                      />
                      <input
                        className={inputClasses()}
                        placeholder="Degree"
                        value={row.degree}
                        onChange={(event) =>
                          setEducation((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, degree: event.target.value } : item))
                        }
                      />
                      <select
                        className={inputClasses()}
                        value={row.discipline}
                        onChange={(event) =>
                          setEducation((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, discipline: event.target.value } : item))
                        }
                      >
                        <option value="">Discipline</option>
                        <option>Computer Science</option>
                        <option>Design</option>
                        <option>Logistics</option>
                        <option>Data Science</option>
                        <option>Business</option>
                        <option>Other</option>
                      </select>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm font-semibold text-amber-700 hover:text-amber-600"
                    onClick={() => setEducation((current) => [...current, { ...emptyEducation }])}
                  >
                    + Add another
                  </button>
                </div>

                <div className="border-t border-gray-200 pt-6" />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label required>Full Legal Name</Label>
                    <input className={inputClasses(Boolean(errors.fullLegalName))} value={form.fullLegalName} onChange={(event) => updateForm("fullLegalName", event.target.value)} />
                    <FieldError message={errors.fullLegalName} />
                  </div>
                  <div>
                    <Label required>Your Location</Label>
                    <input className={inputClasses(Boolean(errors.legalLocation))} value={form.legalLocation} onChange={(event) => updateForm("legalLocation", event.target.value)} />
                    <FieldError message={errors.legalLocation} />
                  </div>
                  <div>
                    <Label>Website</Label>
                    <input className={inputClasses()} value={form.website} onChange={(event) => updateForm("website", event.target.value)} />
                  </div>
                  <div>
                    <Label>LinkedIn Profile</Label>
                    <input className={inputClasses()} value={form.linkedin} onChange={(event) => updateForm("linkedin", event.target.value)} />
                  </div>
                  <div>
                    <Label>X Profile</Label>
                    <input className={inputClasses()} value={form.xProfile} onChange={(event) => updateForm("xProfile", event.target.value)} />
                  </div>
                </div>

                <div>
                  <Label required>What makes you the ideal candidate for this role?</Label>
                  <textarea className={textareaClasses(Boolean(errors.idealCandidateAnswer))} value={form.idealCandidateAnswer} onChange={(event) => updateForm("idealCandidateAnswer", event.target.value)} />
                  <FieldError message={errors.idealCandidateAnswer} />
                </div>

                <div>
                  <Label required>What exceptional work have you done?</Label>
                  <textarea className={textareaClasses(Boolean(errors.proudWorkAnswer))} value={form.proudWorkAnswer} onChange={(event) => updateForm("proudWorkAnswer", event.target.value)} />
                  <p className="mt-1 text-sm text-gray-500">In 100 words or less.</p>
                  <FieldError message={errors.proudWorkAnswer} />
                </div>

                <div>
                  <Label required>Visa sponsorship required?</Label>
                  <select className={inputClasses(Boolean(errors.visaSponsorship))} value={form.visaSponsorship} onChange={(event) => updateForm("visaSponsorship", event.target.value)}>
                    <option value="">Select an option</option>
                    <option>No</option>
                    <option>Yes</option>
                    <option>Unsure</option>
                  </select>
                  <FieldError message={errors.visaSponsorship} />
                </div>

                {submitError ? (
                  <p className="rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-700">{submitError}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-amber-600 px-8 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit application"}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function FilePicker({
  label,
  required,
  file,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  file: File | null;
  error?: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-600 transition hover:bg-gray-50">
        <span className="truncate">{file?.name || "Choose file"}</span>
        <span className="shrink-0 font-semibold text-amber-700">Browse</span>
        <input
          type="file"
          className="sr-only"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </label>
      <FieldError message={error} />
    </div>
  );
}
