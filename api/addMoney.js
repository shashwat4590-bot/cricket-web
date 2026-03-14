import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res){

if(req.method !== "POST"){
return res.status(405).json({ error: "Method not allowed"})
}

const { user_id, amount } = req.body

const { data } = await supabase
.from("wallets")
.select("balance")
.eq("user_id", user_id)
.single()

const newBalance = data.balance + amount

await supabase
.from("wallets")
.update({ balance: newBalance })
.eq("user_id", user_id)

await supabase
.from("transactions")
.insert([
{
user_id: user_id,
amount: amount,
type: "add_money"
}
])

res.status(200).json({ success:true })

}
