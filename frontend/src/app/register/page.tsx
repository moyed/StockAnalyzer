"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", password_confirmation: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await register(form.name, form.email, form.password, form.password_confirmation);
      router.push("/");
    } catch {
      setError("Registration failed. Email may already be in use.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-16">
      <Card className="p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Create account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="Full name" value={form.name} onChange={set("name")} required />
          <Input type="email" placeholder="Email" value={form.email} onChange={set("email")} required />
          <Input type="password" placeholder="Password" value={form.password} onChange={set("password")} required />
          <Input type="password" placeholder="Confirm password" value={form.password_confirmation} onChange={set("password_confirmation")} required />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full bg-green-700 hover:bg-green-800">
            {loading ? "Creating account..." : "Register"}
          </Button>
        </form>
        <p className="text-sm text-gray-500 text-center mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-green-700 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
