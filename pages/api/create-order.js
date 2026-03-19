import axios from "axios";
import { createClient } from "@supabase/supabase-js";

// Supabase setup
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // Allow only POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { user_id, amount } = req.body;

    // Basic validation
    if (!user_id || !amount) {
      return res.status(400).json({ error: "Missing user_id or amount" });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Create unique order ID
    const order_id = "order_" + Date.now();

    // 1️⃣ Save order in DB
    const { error: dbError } = await supabase.from("orders").insert([
      {
        order_id,
        user_id,
        amount,
        status: "pending",
      },
    ]);

    if (dbError) {
      console.error("DB Error:", dbError);
      return res.status(500).json({ error: "Database error" });
    }

    // 2️⃣ Create order in Cashfree
    const response = await axios.post(
      "https://api.cashfree.com/pg/orders",
      {
        order_id: order_id,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: user_id,
          customer_email: "test@test.com",
          customer_phone: "9999999999",
        },
        order_meta: {
          notify_url:
            "https://ipl-web-ten.vercel.app/api/webhook"
      },
      {
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET,
          "x-api-version": "2022-09-01",
          "Content-Type": "application/json",
        },
      }
    );

    // 3️⃣ Return session ID to frontend
    return res.status(200).json({
      success: true,
      order_id: order_id,
      payment_session_id: response.data.payment_session_id,
    });

  } catch (err) {
    console.error("ERROR:", err?.response?.data || err.message);

    return res.status(500).json({
      error: "Something went wrong",
      details: err?.response?.data || err.message,
    });
  }
}
