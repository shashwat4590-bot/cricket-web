import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Cashfree sends event data
    const order_id = req.body?.data?.order?.order_id;

    if (!order_id) {
      return res.status(400).json({ error: "No order_id" });
    }

    // 1. Get order from DB
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_id", order_id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // 2. Prevent double processing
    if (order.status === "paid") {
      return res.json({ success: true });
    }

    // 3. Verify payment with Cashfree (IMPORTANT)
    const verify = await axios.get(
      `https://sandbox.cashfree.com/pg/orders/${order_id}`,
      {
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET,
          "x-api-version": "2022-09-01",
        },
      }
    );

    const payment_status = verify.data.order_status;

    if (payment_status === "PAID") {

      // 4. Get current wallet balance
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", order.user_id)
        .single();

      const newBalance = (wallet?.balance || 0) + order.amount;

      // 5. Update wallet
      await supabase.from("wallets").upsert({
        user_id: order.user_id,
        balance: newBalance,
      });

      // 6. Save transaction
      await supabase.from("transactions").insert([
        {
          user_id: order.user_id,
          amount: order.amount,
          type: "add_money",
        },
      ]);

      // 7. Mark order as paid
      await supabase
        .from("orders")
        .update({ status: "paid" })
        .eq("order_id", order_id);
    }

    return res.json({ success: true });

  } catch (err) {
    console.error("Webhook error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
