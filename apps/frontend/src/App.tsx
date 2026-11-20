import { useQuery } from "@tanstack/react-query";

interface HealthResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error("Unable to connect to backend");
  }

  return response.json();
}

function App() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["backend-health"],
    queryFn: fetchHealth
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
          Hack Kit
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          Full-stack starter
        </h1>

        <p className="mt-3 text-slate-400">
          React frontend connected to the Express backend.
        </p>

        <div className="mt-8 rounded-xl bg-slate-800 p-5">
          <p className="text-sm text-slate-400">
            Backend connection
          </p>

          {isPending && (
            <p className="mt-2 text-yellow-400">
              Connecting...
            </p>
          )}

          {isError && (
            <p className="mt-2 text-red-400">
              Backend connection failed.
            </p>
          )}

          {data && (
            <div className="mt-2">
              <p className="font-semibold text-green-400">
                {data.message}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                {data.timestamp}
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;