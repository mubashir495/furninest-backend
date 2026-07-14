import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SECRET_KEY');

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is missing in .env');
    }

    if (!supabaseKey) {
      throw new Error('SUPABASE_SECRET_KEY is missing in .env');
    }

    this.client = createClient(supabaseUrl, supabaseKey);

    console.log('✅ Supabase connected successfully');
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}