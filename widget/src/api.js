export async function fetchTracking(tenantId, trackingNumber) {
  const encodedNumber = encodeURIComponent(trackingNumber);
  const encodedTenant = encodeURIComponent(tenantId);
  const url = `https://api.fauward.com/v1/tracking/${encodedNumber}?tenant_id=${encodedTenant}`;

  const response = await fetch(url, { headers: { accept: "application/json" } });

  if (response.status === 404) {
    const error = new Error("not_found");
    error.code = "not_found";
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || "request_failed");
    error.code = "request_failed";
    throw error;
  }

  return response.json();
}

