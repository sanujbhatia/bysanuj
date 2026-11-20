import { db } from "@/db";
import { ProfileForm } from "@/components/admin-client";

export const dynamic = "force-dynamic";

export default async function AdminProfile() {
  const p = await db.query.profile.findFirst();
  return (
    <div>
      <h2 className="mb-1 text-[16px] font-semibold">Public profile</h2>
      <p className="mb-5 text-[13.5px] text-muted">This is the header of your portfolio page. Up to six featured articles show below it.</p>
      <ProfileForm
        p={{
          name: p?.name ?? "Sanuj Bhatia",
          headline: p?.headline ?? "",
          bio: p?.bio ?? "",
          avatarUrl: p?.avatarUrl ?? "",
          location: p?.location ?? "",
          email: p?.email ?? "",
          links: p?.links ?? [],
          authorNames: p?.authorNames ?? ["sanuj bhatia"],
        }}
      />
    </div>
  );
}
