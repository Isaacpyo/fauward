"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { ONBOARDING_URL } from "@/lib/marketing-data";

type FormValues = {
  name: string;
  email: string;
  company: string;
  password: string;
  acceptedTerms: boolean;
};

type FormErrors = Partial<Record<keyof FormValues, string>> & { form?: string };

const initialValues: FormValues = {
  name: "",
  email: "",
  company: "",
  password: "",
  acceptedTerms: false
};

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.name.trim().length < 2) {
    errors.name = "Please enter your full name.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (values.company.trim().length < 2) {
    errors.company = "Company name is required.";
  }
  if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }
  if (!values.acceptedTerms) {
    errors.acceptedTerms = "You must accept the terms.";
  }

  return errors;
}

export default function SignupForm() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>("");

  const errors = useMemo(() => validate(values), [values]);
  const isValid = Object.keys(errors).length === 0;

  const fieldError = (field: keyof FormValues) => (touched[field] ? errors[field] : undefined);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({
      name: true,
      email: true,
      company: true,
      password: true,
      acceptedTerms: true
    });

    if (!isValid) {
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || "Unable to start your trial right now.");
      }

      window.location.assign(ONBOARDING_URL);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start your trial right now.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-semibold text-gray-700">
          Name
        </label>
        <input
          id="name"
          name="name"
          value={values.name}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="name"
          required
        />
        {fieldError("name") ? <p className="mt-1 text-sm text-red-600">{fieldError("name")}</p> : null}
      </div>

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-700">
          Work email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          value={values.email}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="email"
          required
        />
        {fieldError("email") ? <p className="mt-1 text-sm text-red-600">{fieldError("email")}</p> : null}
      </div>

      <div>
        <label htmlFor="company" className="mb-2 block text-sm font-semibold text-gray-700">
          Company
        </label>
        <input
          id="company"
          name="company"
          value={values.company}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, company: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="organization"
          required
        />
        {fieldError("company") ? <p className="mt-1 text-sm text-red-600">{fieldError("company")}</p> : null}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          value={values.password}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="new-password"
          required
        />
        {fieldError("password") ? <p className="mt-1 text-sm text-red-600">{fieldError("password")}</p> : null}
      </div>

      <div>
        <label className="flex min-h-[44px] items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <input
            type="checkbox"
            name="acceptedTerms"
            checked={values.acceptedTerms}
            onChange={handleChange}
            onBlur={() => setTouched((prev) => ({ ...prev, acceptedTerms: true }))}
            className="mt-1 h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">I agree to the terms and privacy policy.</span>
        </label>
        {fieldError("acceptedTerms") ? <p className="mt-1 text-sm text-red-600">{fieldError("acceptedTerms")}</p> : null}
      </div>

      {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p> : null}

      <button
        type="submit"
        disabled={!isValid || submitting}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-amber-600 px-6 text-base font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
      >
        {submitting ? "Creating account..." : "Start Free Trial"}
      </button>
    </form>
  );
}
