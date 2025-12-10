import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tzufisumkzlluzjujrku.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6dWZpc3Vta3psbHV6anVqcmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzU1MzEsImV4cCI6MjA4MDc1MTUzMX0.l-HQ4Jp26Uchp8RgjQpviK1mOs1ZZrpv--DZHtOnLiU';

export const supabase = createClient(supabaseUrl, supabaseKey);
