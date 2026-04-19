import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BackLink } from "@/components/common/BackLink";
import { ScreenHeader } from "@/components/common/ScreenHeader";
import { SignaturePad } from "@/components/pod/SignaturePad";
import { useFieldDataStore } from "@/store/useFieldDataStore";
import { workflowStageLabel } from "@/types/field";

export const PodCaptureScreen = () => {
  const { stopId } = useParams();
  const navigate = useNavigate();
  const stop = useFieldDataStore((state) => state.stops.find((item) => item.id === stopId));
  const existingDraft = useFieldDataStore((state) => state.podDrafts.find((draft) => draft.stopId === stopId));
  const latestLocation = useFieldDataStore((state) => state.locationPings[0]);
  const savePodDraft = useFieldDataStore((state) => state.savePodDraft);
  const submitPodForStop = useFieldDataStore((state) => state.submitPodForStop);
  const [recipientName, setRecipientName] = useState(existingDraft?.recipientName ?? stop?.contactName ?? "");
  const [otpCode, setOtpCode] = useState(existingDraft?.otpCode ?? "");
  const [photoRefs, setPhotoRefs] = useState<string[]>(existingDraft?.photoRefs ?? []);
  const [signatureRef, setSignatureRef] = useState<string | undefined>(existingDraft?.signatureRef);
  const [notes, setNotes] = useState(existingDraft?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const validationMessage = useMemo(() => {
    if (!stop?.podRequirements) {
      return null;
    }

    if (stop.podRequirements.recipientName && !recipientName.trim()) {
      return "Recipient name is required for this task.";
    }

    if (stop.podRequirements.otp && otpCode.trim().length < 4) {
      return "OTP confirmation is required before closing this task.";
    }

    if (stop.podRequirements.signature && !signatureRef) {
      return "Signature capture is required for this task.";
    }

    if (stop.podRequirements.photo && photoRefs.length === 0) {
      return "At least one proof photo is required.";
    }

    return null;
  }, [otpCode, photoRefs.length, recipientName, signatureRef, stop?.podRequirements]);

  if (!stop || !stop.podRequirements) {
    return (
      <section className="panel p-5 text-sm text-stone-600">
        Confirmation capture is not required for this assigned job.
      </section>
    );
  }

  const handlePhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []).map((file) => file.name);
    setPhotoRefs(nextFiles);
  };

  const saveDraft = () => {
    savePodDraft(stop.id, {
      recipientName,
      otpCode,
      signatureRef,
      photoRefs,
      notes,
      lat: latestLocation?.lat,
      lng: latestLocation?.lng,
      state: "draft",
    });
    setError(null);
  };

  const submitProof = () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    const ok = submitPodForStop(stop.id, {
      recipientName,
      otpCode,
      signatureRef,
      photoRefs,
      notes,
      lat: latestLocation?.lat,
      lng: latestLocation?.lng,
      state: "ready",
    });

    if (!ok) {
      setError("Unable to store the confirmation payload for this task.");
      return;
    }

    navigate(`/stops/${stop.id}`);
  };

  return (
    <section className="space-y-6">
      <BackLink to={`/stops/${stop.id}`} label="Back to job" />
      <ScreenHeader
        title="Capture confirmation"
        subtitle="Recipient details, proof photos, and signatures are stored locally first, then uploaded through the sync queue."
        kicker={`Stop ${stop.sequence} ${workflowStageLabel[stop.workflowStage]}`}
      />

      <article className="panel p-5">
        <div className="space-y-4">
          <div>
            <label htmlFor="recipient-name" className="mb-2 block tiny-label">
              Recipient name
            </label>
            <input
              id="recipient-name"
              className="field-input"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              placeholder="Recipient full name"
            />
          </div>

          {stop.podRequirements?.otp ? (
            <div>
              <label htmlFor="otp-code" className="mb-2 block tiny-label">
                OTP confirmation
              </label>
              <input
                id="otp-code"
                className="field-input"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                inputMode="numeric"
                placeholder="Enter OTP"
              />
            </div>
          ) : null}

          {stop.podRequirements?.photo ? (
            <div>
              <label htmlFor="pod-photo" className="mb-2 block tiny-label">
                Photo confirmation
              </label>
              <input
                id="pod-photo"
                className="field-input"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotos}
              />
              {photoRefs.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {photoRefs.map((photo) => (
                    <div key={photo} className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                      {photo}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {stop.podRequirements?.signature ? (
            <div>
              <p className="mb-2 tiny-label">Recipient signature</p>
              <SignaturePad value={signatureRef} onChange={setSignatureRef} />
            </div>
          ) : null}

          <div>
            <label htmlFor="pod-notes" className="mb-2 block tiny-label">
              Confirmation notes
            </label>
            <textarea
              id="pod-notes"
              className="field-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Recipient remarks, condition notes, or stage handoff details"
            />
          </div>
        </div>
      </article>

      {latestLocation ? (
        <article className="panel p-4 text-sm text-stone-700">
          <p className="tiny-label">Latest location context</p>
          <p className="mt-2">
            {latestLocation.lat.toFixed(5)}, {latestLocation.lng.toFixed(5)}
          </p>
        </article>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3">
        <button type="button" className="secondary-btn w-full" onClick={saveDraft}>
          Save draft
        </button>
        <button type="button" className="primary-btn w-full" onClick={submitProof}>
          Submit confirmation and complete task
        </button>
        <Link to={`/stops/${stop.id}`} className="secondary-btn w-full">
          Back to job
        </Link>
      </div>
    </section>
  );
};
