import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://oxwbnebmuecwgtfncneo.supabase.co'
const supabaseKey = 'sb_publishable_w3ycoVNZmte0q69P8nGjDw__9TqETQa'

export const supabase = createClient(supabaseUrl, supabaseKey)