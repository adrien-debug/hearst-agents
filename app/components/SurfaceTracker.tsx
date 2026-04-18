"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useChatContext } from "../lib/chat-context";
import { useConnectedServices } from "../hooks/use-connected-services";
import type { Surface } from "../lib/missions/types";

const PATH_TO_SURFACE: Record<string, Surface> = {
  "/": "home",
  "/inbox": "inbox",
  "/calendar": "calendar",
  "/files": "files",
  "/tasks": "tasks",
  "/apps": "apps",
};

export default function SurfaceTracker() {
  const pathname = usePathname();
  const { setSurface, setSelectedItem, setConnectedServices, setServicesLoaded } = useChatContext();
  const { connectedProviders, loading } = useConnectedServices();

  useEffect(() => {
    const surface = PATH_TO_SURFACE[pathname] ?? "home";
    setSurface(surface);
    setSelectedItem(null);
  }, [pathname, setSurface, setSelectedItem]);

  useEffect(() => {
    setConnectedServices(connectedProviders);
    if (!loading) setServicesLoaded(true);
  }, [connectedProviders, loading, setConnectedServices, setServicesLoaded]);

  return null;
}
