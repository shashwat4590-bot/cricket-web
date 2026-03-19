import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    console.log("Webhook hit");

    const body = req.body;

    console.log("Webhook body:", body);

    const order_id =
      body?.data?.order?.order_id ||
      body?.order?.order_id ||
      body?.order_id;

    if (!order_id) {
      console.log("No order_id found");
      return res.status(200).json({ ok: true });
    }

    // 🔍 Verify payment
    const verify = await axios.get(
      `https://sandbox.cashfree.com/pg/orders/${order_id}`,
      {
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET,
          "x-api-version": "2022-09-01"
        }
      }
    );

    if (verify.data.order_status === "PAID") {

      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("order_id", order_id)
        .single();

      if (!order) {
        return res.status(200).json({ ok: true });
      }

      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", order.user_id)
        .single();

      const newBalance = (wallet?.balance || 0) + order.amount;

      await supabase.from("wallets").upsert({
        user_id: order.user_id,
        balance: newBalance
      });

      await supabase.from("transactions").insert([
        {
          user_id: order.user_id,
          amount: order.amount,
          type: "add_money"
        }
      ]);

      await supabase
        .from("orders")
        .update({ status: "paid" })
        .eq("order_id", order_id);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true });
  }
}
