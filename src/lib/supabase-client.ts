import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zpqcfjgfchugpuhqtuzb.supabase.co';
const supabaseAnonKey = 'sb_publishable_RDkCmly0mYk_XtANN408Fg_F1GUv1SD';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);