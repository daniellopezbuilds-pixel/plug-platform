import { supabase } from "@/lib/supabase";

export default async function Home() {

  const { data: workers } = await supabase
    .from("workers")
    .select("*");

  return (
    <main className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Plug Platform
      </h1>

      <h2 className="text-2xl mb-6">
        Workers
      </h2>

      <div className="space-y-4">

        {workers?.map((worker) => (
          <div
            key={worker.id}
            className="border border-gray-700 p-4 rounded-lg"
          >

            <h3 className="text-xl font-bold">
              {worker.name}
            </h3>

            <p className="text-gray-400">
              {worker.trade}
            </p>

            <p className="text-yellow-400">
              XP: {worker.xp}
            </p>

          </div>
        ))}

      </div>

    </main>
  );
}