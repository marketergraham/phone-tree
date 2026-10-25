import Link from "next/link";
import { ProviderForm } from "../provider-form";

export default async function NewProvider({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="page stack" style={{ maxWidth: 900 }}>
      <div>
        <Link href="/providers" className="back">← All providers</Link>
        <h1>Add a sitter</h1>
      </div>
      <ProviderForm error={error} />
    </main>
  );
}
