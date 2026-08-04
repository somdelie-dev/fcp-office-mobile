"use client";

import React from "react";
import Header from "./Header";
import ProfileHeroCard from "./ProfileHeroCard";
import IdentityStatusCard from "./IdentityStatusCard";
import ReferencePhotosCard from "./ReferencePhotosCard";
import PrimaryActions from "./PrimaryActions";

export default function FaceVerificationScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-900">
      <div className="max-w-xl mx-auto">
        <Header onBack={onBack} />

        <div className="space-y-3 py-3">
          <ProfileHeroCard />
          <IdentityStatusCard />
          <ReferencePhotosCard />
          <PrimaryActions />
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}
