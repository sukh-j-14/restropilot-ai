import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReservationManager } from "@/components/reservations/reservation-manager";
import { addDays, dateKey, dayRange, getZonedDateParts } from "@/lib/dashboard/date";
import { listReservations } from "@/lib/services/reservations";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export default async function ReservationsPage() {
  await connection();
  let restaurant;
  try { restaurant = await getCurrentRestaurant(); } catch { redirect("/onboarding"); }
  if (!restaurant) redirect("/onboarding");

  const todayKey = dateKey(getZonedDateParts(new Date(), restaurant.timezone));
  const todayRange = dayRange(todayKey, restaurant.timezone);
  const upcomingEnd = dayRange(addDays(todayKey, 31), restaurant.timezone).start;
  const [today, upcoming] = await Promise.all([
    listReservations({ restaurantId: restaurant.id, ...todayRange }),
    listReservations({ restaurantId: restaurant.id, start: todayRange.end, end: upcomingEnd }),
  ]);
  const activeToday = today.filter((item) => ["PENDING", "CONFIRMED", "SEATED"].includes(item.status));
  const expectedGuests = activeToday.reduce((sum, item) => sum + item.guestCount, 0);
  const occupancy = restaurant.guestCapacity ? Math.round((expectedGuests / restaurant.guestCapacity) * 100) : null;

  return <DashboardShell restaurantName={restaurant.name} activeNavigation="reservations">
    <main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-emerald-700">Front of house</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">Reservations</h1><p className="mt-1.5 text-sm text-slate-500">Manage today’s bookings and the upcoming guest schedule.</p></div><p className="text-xs text-slate-500">Times shown in <strong className="text-slate-700">{restaurant.timezone}</strong></p></div>
      <section className="mt-7 grid gap-4 sm:grid-cols-3" aria-label="Today’s reservation summary">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reservations today</p><p className="mt-2 text-2xl font-bold text-slate-900">{activeToday.length}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Expected guests</p><p className="mt-2 text-2xl font-bold text-slate-900">{expectedGuests}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Capacity indicator</p><p className="mt-2 text-2xl font-bold text-slate-900">{occupancy === null ? "Not set" : `${occupancy}%`}</p><p className="mt-1 text-xs text-slate-400">{restaurant.guestCapacity ? `${restaurant.guestCapacity} guest operational capacity` : "Add capacity in restaurant setup"}</p></div>
      </section>
      <div className="mt-7"><ReservationManager today={today} upcoming={upcoming} timezone={restaurant.timezone} guestCapacity={restaurant.guestCapacity} /></div>
    </main>
  </DashboardShell>;
}
