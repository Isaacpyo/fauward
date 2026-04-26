import CareersJobListingPage from "@/components/careers/CareersJobListingPage";

export default function JobListingRoute({ params }: { params: { "job-slug": string } }) {
  return (
    <CareersJobListingPage
      jobSlug={params["job-slug"]}
      jobsSheetId={process.env.VITE_JOBS_SHEET_ID}
      appsScriptUrl={process.env.VITE_APPS_SCRIPT_URL}
    />
  );
}
