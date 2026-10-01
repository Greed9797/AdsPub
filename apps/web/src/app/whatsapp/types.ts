export interface WhatsappAccount {
  id: string;
  client_id: string;
  waba_id: string;
  phone_number_id: string;
  display_name: string;
  display_phone: string;
  status: string;
  last_error: string | null;
}

export interface WhatsappPhone {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  status?: string;
}

export interface WhatsappTemplate {
  id: string;
  name: string;
  status?: string;
  language?: string;
  category?: string;
}
