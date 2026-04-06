import { useEffect, useState } from "react";

type GeoState = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export function useGeolocation() {
  const [position, setPosition] = useState<GeoState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (result) =>
        setPosition({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy
        }),
      () => setError("Location unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { position, error };
}

