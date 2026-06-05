import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const shopDomain = process.argv[2];

if (!shopDomain) {
  console.error("Please provide the shop domain. Example: npx tsx reset-shop.ts mystore.myshopify.com");
  process.exit(1);
}

console.log(`Starting complete reset for shop: ${shopDomain}...\n`);

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

async function main() {
  try {
    // 1. Delete Prisma Sessions
    const deletedSessions = await prisma.session.deleteMany({
      where: { shop: shopDomain }
    });
    console.log(`✅ Deleted ${deletedSessions.count} sessions from local Prisma DB.`);

    // 2. Delete Supabase Form Settings
    const { error: formSettingsError, count: formSettingsCount } = await supabase
      .from('form_settings')
      .delete({ count: 'exact' })
      .eq('shop_domain', shopDomain);

    if (formSettingsError) {
      console.error(`❌ Error deleting form_settings:`, formSettingsError.message);
    } else {
      console.log(`✅ Deleted ${formSettingsCount || 0} form_settings rows from Supabase.`);
    }

    // 3. Delete Supabase Shop Record
    const { error: shopError, count: shopCount } = await supabase
      .from('shops')
      .delete({ count: 'exact' })
      .eq('shop_domain', shopDomain);

    if (shopError) {
      console.error(`❌ Error deleting shops:`, shopError.message);
    } else {
      console.log(`✅ Deleted ${shopCount || 0} shop rows from Supabase.`);
    }

    // 4. (Optional) Delete Order Logs
    const { error: logsError, count: logsCount } = await supabase
      .from('order_logs')
      .delete({ count: 'exact' })
      .eq('shop_domain', shopDomain);

    if (logsError) {
      console.error(`❌ Error deleting order_logs:`, logsError.message);
    } else {
      console.log(`✅ Deleted ${logsCount || 0} order_logs rows from Supabase.`);
    }

    console.log(`\n🎉 Success! The shop '${shopDomain}' has been completely wiped from your app's databases.`);
    console.log(`You can now reinstall the app on this store, and it will trigger the new 'afterAuth' onboarding logic as a brand new merchant.`);

  } catch (error) {
    console.error("Unexpected error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
