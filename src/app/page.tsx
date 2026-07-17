"use client";

import { AuthGate } from "@/components/auth/AuthGate";
import { NexusPortal } from "@/components/nexus/NexusPortal";

export default function Home() {
  return (
    <AuthGate>
      <NexusPortal />
    </AuthGate>
  );
}
