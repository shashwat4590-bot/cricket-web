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
    console.log("Webhook body:", JSON.stringify(body));

    const order_id =
      body?.data?.order?.order_id ||
      body?.order?.order_id ||
      body?.order_id;

    if (!order_id) {
      console.log("❌ No order_id found");
      return res.status(200).json({ ok: true });
    }

    console.log("Order ID:", order_id);

    // 🔍 Verify payment from Cashfree
    const verify = await axios.get(
      `https://api.cashfree.com/pg/orders/${order_id}`,
      {
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET,
          "x-api-version": "2022-09-01"
        }
      }
    );

    console.log("Cashfree status:", verify.data.order_status);

    if (verify.data.order_status !== "PAID") {
      console.log("❌ Not paid");
      return res.status(200).json({ ok: true });
    }

    // 📦 Get order from DB
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("order_id", order_id)
      .single();

    if (orderErr || !order) {
      console.log("❌ Order not found:", orderErr);
      return res.status(200).json({ ok: true });
    }

    console.log("Order found:", order);

    // 💰 Get wallet (safe)
    const { data: wallet, error: walletErr } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", order.user_id)
      .maybeSingle();

    if (walletErr) {
      console.log("Wallet fetch error:", walletErr);
    }

    const currentBalance = wallet?.balance || 0;
    const newBalance = currentBalance + Number(order.amount);

    console.log("Updating wallet:", currentBalance, "→", newBalance);

    // ✅ Upsert wallet
    const { error: upsertErr } = await supabase
      .from("wallets")
      .upsert({
        user_id: order.user_id,
        balance: newBalance
      });

    if (upsertErr) {
      console.log("❌ Wallet update failed:", upsertErr);
    }

    // 📜 Insert transaction
    const { error: txnErr } = await supabase
      .from("transactions")
      .insert([
        {
          user_id: order.user_id,
          amount: order.amount,
          type: "add_money"
        }
      ]);

    if (txnErr) {
      console.log("❌ Transaction error:", txnErr);
    }

    // ✅ Mark order as paid
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("order_id", order_id);

    if (updateErr) {
      console.log("❌ Order update error:", updateErr);
    }

    console.log("✅ Webhook completed successfully");

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("🔥 Webhook crash:", err);
    return res.status(200).json({ ok: true });
  }
}
