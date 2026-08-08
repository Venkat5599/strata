import {Sidebar} from "@/components/Sidebar";

export default function DashboardLayout({children}: {children: React.ReactNode}) {
  return (
    <div className="dash">
      <Sidebar />
      <div className="dash-main">{children}</div>
    </div>
  );
}
