"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { sampleRoles, type CareerRole } from "@/components/careers/careers-data";

const departments = ["All", "Engineering", "Research", "Design"] as const;
type DepartmentFilter = (typeof departments)[number];

export default function CareersOpenRolesPage({ roles = sampleRoles }: { roles?: CareerRole[] }) {
  const [filter, setFilter] = useState<DepartmentFilter>("All");

  const filteredRoles = useMemo(
    () => roles.filter((role) => filter === "All" || role.department === filter),
    [filter, roles],
  );

  return (
    <>
      <section className="border-b border-gray-200 bg-white py-16 lg:py-20">
        <div className="marketing-container">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Careers at Fauward</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-6xl">
            Open Roles at Fauward
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600">
            Join us - we&apos;re hiring across Engineering, Research, and Design.
          </p>
        </div>
      </section>

      <section className="bg-white py-12 lg:py-16">
        <div className="marketing-container">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter roles by department">
              {departments.map((department) => {
                const active = filter === department;
                return (
                  <button
                    key={department}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(department)}
                    className={
                      active
                        ? "inline-flex h-10 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700"
                        : "inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 hover:text-brand-navy"
                    }
                  >
                    {department}
                  </button>
                );
              })}
            </div>
            <p className="text-sm font-semibold text-gray-500">
              Showing {filteredRoles.length} of {roles.length} roles
            </p>
          </div>

          <div className="border-t border-gray-200">
            {filteredRoles.map((role) => (
              <article
                key={role.slug}
                className="grid gap-4 border-b border-gray-200 py-5 transition hover:bg-gray-50 md:grid-cols-[1.2fr,0.9fr,auto] md:items-center md:px-4"
              >
                <h2 className="text-base font-bold text-gray-900">{role.title}</h2>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{role.department}</span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{role.location}</span>
                </div>
                <Link
                  href={`/careers/open-roles/${role.slug}`}
                  className="justify-self-start text-sm font-bold text-amber-700 transition hover:text-amber-600 md:justify-self-end"
                >
                  Apply -&gt;
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
