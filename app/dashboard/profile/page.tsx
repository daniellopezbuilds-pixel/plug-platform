"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import { uploadResume, getResumeSignedUrl } from "@/lib/resume";
import { uploadLogo, uploadBanner, getBrandingPublicUrl } from "@/lib/branding";
import { uploadEmployerDocument, getEmployerDocumentSignedUrl } from "@/lib/employerDocuments";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  const [profileNumber, setProfileNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [trade, setTrade] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [unionStatus, setUnionStatus] = useState<string | null>(null);
  const [unionVerified, setUnionVerified] = useState(false);
  const [yearsExperience, setYearsExperience] = useState("");
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [companyBannerPath, setCompanyBannerPath] = useState<string | null>(null);
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [employerDocPath, setEmployerDocPath] = useState<string | null>(null);
  const [employerDocLabel, setEmployerDocLabel] = useState<string | null>(null);
  const [uploadingEmployerDoc, setUploadingEmployerDoc] = useState(false);
  const [employerVerified, setEmployerVerified] = useState(false);

  const { reviews, averageRating, count } = useReviews(userId || null);
  const { hiredCount, jobsLandedCount } = useProfileStats(userId || null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.from("profiles").insert({
          id: user.id,
          email: user.email,
          xp: 0,
        });

        setLoading(false);
        return;
      }

      setProfileNumber(profile.profile_number || "");
      setFullName(profile.full_name || "");
      setUsername(profile.username || "");
      setTrade(profile.trade || "");
      setBio(profile.bio || "");
      setLocation(profile.location || "");
      setUnionStatus(profile.union_status || null);
      setUnionVerified(profile.union_verified || false);
      setYearsExperience(profile.years_experience?.toString() || "");
      setResumePath(profile.resume_path || null);

      setCompanyLogoPath(profile.company_logo_path || null);
      setCompanyBannerPath(profile.company_banner_path || null);
      setCompanyDescription(profile.company_description || "");
      setCompanyWebsite(profile.company_website || "");
      setEmployerVerified(profile.employer_verified || false);

      const { data: doc } = await supabase
        .from("employer_documents")
        .select("label, file_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (doc) {
        setEmployerDocLabel(doc.label);
        setEmployerDocPath(doc.file_path);
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleSave() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        trade,
        bio,
        location,
        union_status: unionStatus,
        union_verified: false,
        years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
        company_description: companyDescription,
        company_website: companyWebsite,
      })
      .eq("id", user.id);

    if (error) {
      alert(error.message);
      return;
    }

    setUnionVerified(false);
    alert("Profile updated successfully.");
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Only PDF files are accepted.");
      return;
    }

    setUploadingResume(true);

    const { error, path } = await uploadResume(userId, file);

    if (error) {
      alert(error);
      setUploadingResume(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ resume_path: path })
      .eq("id", userId);

    setUploadingResume(false);

    if (dbError) {
      alert(dbError.message);
      return;
    }

    setResumePath(path);
    alert("Resume uploaded successfully.");
  }

  async function handleViewResume() {
    if (!resumePath) return;

    const { error, url } = await getResumeSignedUrl(resumePath);

    if (error || !url) {
      alert(error || "Could not open resume.");
      return;
    }

    window.open(url, "_blank");
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Only image files are accepted.");
      return;
    }

    setUploadingLogo(true);

    const { error, path } = await uploadLogo(userId, file);

    if (error || !path) {
      alert(error || "Upload failed.");
      setUploadingLogo(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ company_logo_path: path })
      .eq("id", userId);

    setUploadingLogo(false);

    if (dbError) {
      alert(dbError.message);
      return;
    }

    setCompanyLogoPath(path);
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Only image files are accepted.");
      return;
    }

    setUploadingBanner(true);

    const { error, path } = await uploadBanner(userId, file);

    if (error || !path) {
      alert(error || "Upload failed.");
      setUploadingBanner(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ company_banner_path: path })
      .eq("id", userId);

    setUploadingBanner(false);

    if (dbError) {
      alert(dbError.message);
      return;
    }

    setCompanyBannerPath(path);
  }

  async function handleEmployerDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingEmployerDoc(true);

    const { error, path } = await uploadEmployerDocument(userId, file);

    setUploadingEmployerDoc(false);

    if (error || !path) {
      alert(error || "Upload failed.");
      return;
    }

    setEmployerDocPath(path);
    setEmployerDocLabel(file.name);
    alert("Document uploaded. An admin will review it shortly.");
  }

  async function handleViewEmployerDoc() {
    if (!employerDocPath) return;

    const { error, url } = await getEmployerDocumentSignedUrl(employerDocPath);

    if (error || !url) {
      alert(error || "Could not open document.");
      return;
    }

    window.open(url, "_blank");
  }

  if (loading) {
    return <div className="text-white">Loading...</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-5xl font-bold mb-8 text-white">Edit Profile</h1>

      <div className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Profile Number</label>
          <div className="w-full p-4 rounded bg-zinc-800 border border-zinc-700 text-yellow-400 font-semibold">
            {profileNumber}
          </div>
        </div>

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Trade"
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <textarea
          placeholder="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 h-40 text-white"
        />

        <input
          type="text"
          placeholder="Location (e.g. Los Angeles, CA)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="number"
          min="0"
          placeholder="Years of Experience"
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <div>
          <label className="block text-sm text-gray-400 mb-2">Union Status</label>
          <div className="flex gap-3 mb-2">
            <button
              type="button"
              onClick={() => setUnionStatus("union")}
              className={`px-5 py-3 rounded-lg font-semibold border transition ${
                unionStatus === "union"
                  ? "bg-blue-950 border-blue-700 text-blue-400"
                  : "bg-zinc-900 border-zinc-800 text-gray-400"
              }`}
            >
              Union
            </button>
            <button
              type="button"
              onClick={() => setUnionStatus("non_union")}
              className={`px-5 py-3 rounded-lg font-semibold border transition ${
                unionStatus === "non_union"
                  ? "bg-zinc-700 border-zinc-500 text-white"
                  : "bg-zinc-900 border-zinc-800 text-gray-400"
              }`}
            >
              Non-Union
            </button>
          </div>
          {unionStatus && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Preview:</span>
              <UnionBadge status={unionStatus} verified={unionVerified} />
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">
            This is self-reported. An admin will verify it before it shows as confirmed.
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Resume (PDF only)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleResumeUpload}
            disabled={uploadingResume}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
          />
          {uploadingResume && <p className="text-sm text-gray-400 mt-2">Uploading...</p>}
          {resumePath && !uploadingResume && (
            <button
              onClick={handleViewResume}
              className="mt-3 text-yellow-400 hover:text-yellow-300 text-sm font-semibold"
            >
              View current resume →
            </button>
          )}
        </div>

        <div className="border-t border-zinc-800 pt-6 mt-2">
          <h2 className="text-xl font-bold text-white mb-4">Company Branding</h2>

          <div className="mb-5">
            <label className="block text-sm text-gray-400 mb-2">Company Logo</label>
            {companyLogoPath && (
              <img
                src={getBrandingPublicUrl(companyLogoPath)}
                alt="Company logo preview"
                className="w-20 h-20 rounded-full object-cover border border-zinc-700 mb-3"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploadingLogo}
              className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
            />
            {uploadingLogo && <p className="text-sm text-gray-400 mt-2">Uploading...</p>}
          </div>

          <div className="mb-5">
            <label className="block text-sm text-gray-400 mb-2">Company Banner</label>
            {companyBannerPath && (
              <img
                src={getBrandingPublicUrl(companyBannerPath)}
                alt="Company banner preview"
                className="w-full h-32 rounded object-cover border border-zinc-700 mb-3"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleBannerUpload}
              disabled={uploadingBanner}
              className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
            />
            {uploadingBanner && <p className="text-sm text-gray-400 mt-2">Uploading...</p>}
          </div>

          <textarea
            placeholder="Company Description"
            value={companyDescription}
            onChange={(e) => setCompanyDescription(e.target.value)}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 h-32 text-white mb-5"
          />

          <input
            type="text"
            placeholder="Company Website (e.g. yourcompany.com)"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
          />

          <div className="mt-5">
            <label className="block text-sm text-gray-400 mb-2">
              Verification Document{" "}
              {employerVerified && <span className="text-green-400">(Verified ✓)</span>}
            </label>
            <input
              type="file"
              onChange={handleEmployerDocUpload}
              disabled={uploadingEmployerDoc}
              className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
            />
            {uploadingEmployerDoc && <p className="text-sm text-gray-400 mt-2">Uploading...</p>}
            {employerDocPath && !uploadingEmployerDoc && (
              <button
                onClick={handleViewEmployerDoc}
                className="mt-3 text-yellow-400 hover:text-yellow-300 text-sm font-semibold"
              >
                View uploaded document: {employerDocLabel} →
              </button>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          className="bg-white text-black px-6 py-4 rounded font-semibold"
        >
          Save Profile
        </button>
      </div>

      <div className="mt-12 border-t border-zinc-800 pt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">Your Reputation</h2>
          <ReviewSummary averageRating={averageRating} count={count} />
        </div>

        {(hiredCount > 0 || jobsLandedCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {hiredCount > 0 && (
              <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
                {hiredCount} {hiredCount === 1 ? "person" : "people"} hired
              </span>
            )}
            {jobsLandedCount > 0 && (
              <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
                {jobsLandedCount} {jobsLandedCount === 1 ? "job" : "jobs"} landed
              </span>
            )}
          </div>
        )}

        <ReviewsList reviews={reviews} />
      </div>
    </div>
  );
}