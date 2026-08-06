/**
 * No `<AdminLayout>` here, deliberately.
 *
 * It used to render one, and `src/app/clients/layout.tsx` — its PARENT — renders
 * one too. Next nests layouts, so `/clients/<id>` drew the entire console twice:
 * two sidebars, two headers, two search boxes, two logout buttons, and the
 * session and permission gates evaluated twice, with the inner spinner rendering
 * inside the outer chrome on every load.
 *
 * The auth-relevant half is that `AdminLayout` IS the gate, so the deepest route
 * in the console was the one evaluating it twice. The e2e suite hid it by
 * reaching for the logout button with `.first()`, which passes whether there is
 * one or two.
 *
 * The file stays rather than being deleted: it is the segment's own layout, and
 * a future title or metadata belongs here.
 */
export default function ClientProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
