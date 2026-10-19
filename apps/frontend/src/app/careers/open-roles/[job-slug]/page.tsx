import CareersJobListingPage from "@/components/careers/CareersJobListingPage";
import { getCareersConfig } from "@/lib/careers-jobs";

export default function JobListingRoute({ params }: { params: { "job-slug": string } }) {
  const { jobsSheetId, appsScriptUrl } = getCareersConfig();

  return (
    <CareersJobListingPage
      jobSlug={params["job-slug"]}
      jobsSheetId={jobsSheetId}
      appsScriptUrl={appsScriptUrl}
    />
  );
}
