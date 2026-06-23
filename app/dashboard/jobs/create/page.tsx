"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CreateJobPage() {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [pay, setPay] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("You must be logged in.");
      return;
    }

    const { error } = await supabase
      .from("jobs")
      .insert([
        {
          user_id: user.id,
          title,
          company,
          location,
          pay,
          description,
        },
      ]);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    alert("Job posted successfully!");

    setTitle("");
    setCompany("");
    setLocation("");
    setPay("");
    setDescription("");
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-5xl font-bold text-white mb-8">
        Post a Job
      </h1>

      <div className="space-y-4">
        <input
          type="text"
          placeholder="Job Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Pay"
          value={pay}
          onChange={(e) => setPay(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <textarea
          placeholder="Job Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-40 p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <button
          onClick={handleSubmit}
          className="bg-white text-black px-6 py-4 rounded font-semibold"
        >
          Post Job
        </button>
      </div>
    </div>
  );
}