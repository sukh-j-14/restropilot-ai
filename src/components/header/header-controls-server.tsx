import { HeaderControls } from "@/components/header/header-controls";
import { getOperationalNotifications } from "@/lib/services/notifications";
import { getCurrentRestaurant } from "@/lib/services/tenant";

export async function HeaderControlsServer() {
  let notifications = [] as Awaited<ReturnType<typeof getOperationalNotifications>>["items"];
  let notificationDataUnavailable = false;
  try {
    const restaurant = await getCurrentRestaurant();
    if (restaurant) {
      const result = await getOperationalNotifications({ restaurantId: restaurant.id, timeZone: restaurant.timezone });
      notifications = result.items;
      notificationDataUnavailable = result.hadErrors;
    }
  } catch {
    notificationDataUnavailable = true;
  }
  return <HeaderControls notifications={notifications} notificationDataUnavailable={notificationDataUnavailable} />;
}
