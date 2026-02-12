/**
 * Seed data for E2E tests.
 *
 * Seeds test data via real API calls — NO database mocking.
 * Requires the backend to be running at API_BASE_URL.
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000/api/v1";

export const TEST_USER = {
  first_name: "E2E",
  last_name: "Tester",
  username: "e2e_tester",
  email: "e2e@ringai.test",
  phone: "+9779800000001",
  password: "TestPass123!",
};

export const SECONDARY_USER = {
  first_name: "Second",
  last_name: "User",
  username: "second_user",
  email: "second@ringai.test",
  phone: "+9779800000002",
  password: "TestPass456!",
};

interface AuthTokens {
  access_token: string;
  org_id?: string;
}

interface SeededData {
  tokens: AuthTokens;
  org_id: string;
  campaigns: Array<{ id: string; name: string; type: string }>;
  templates: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; phone: string; name: string }>;
}

async function apiPost(
  path: string,
  body: Record<string, unknown>,
  token?: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function apiGet(
  path: string,
  token: string
): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function registerUser(
  user: typeof TEST_USER
): Promise<{ id: string }> {
  const data = (await apiPost("/auth/register", user)) as { id: string };
  return data;
}

async function loginUser(
  email: string,
  password: string
): Promise<AuthTokens> {
  const data = (await apiPost("/auth/login", {
    email,
    password,
  })) as AuthTokens;
  return data;
}

async function seedTemplates(
  token: string,
  orgId: string
): Promise<Array<{ id: string; name: string }>> {
  const templates = [
    {
      name: "बिल भुक्तानी स्मरण",
      content:
        "नमस्कार {customer_name}, तपाईंको {service_name} सेवाको रु.{amount} बिल {due_date} सम्ममा तिर्नुहोस्।{?late_fee} ढिलो शुल्क रु.{late_fee} लाग्नेछ।{/late_fee}",
      type: "voice" as const,
      org_id: orgId,
      language: "ne",
    },
    {
      name: "OTP प्रमाणीकरण",
      content:
        "तपाईंको OTP कोड {otp_code} हो। यो {expiry_minutes} मिनेटमा समाप्त हुन्छ।",
      type: "text" as const,
      org_id: orgId,
      language: "ne",
    },
    {
      name: "ग्राहक सन्तुष्टि सर्वेक्षण",
      content:
        "नमस्कार {customer_name}, {service_name} सेवामा तपाईंको अनुभव कस्तो रह्यो?{?agent_name} तपाईंलाई {agent_name} ले सेवा दिनुभएको थियो।{/agent_name} कृपया 1 देखि 5 सम्म अंक दिनुहोस्।",
      type: "voice" as const,
      org_id: orgId,
      language: "ne",
    },
    {
      name: "KYC अनुस्मारक",
      content:
        "नमस्कार {customer_name}, तपाईंको {account_type} खाताको KYC {deadline} भित्र पूरा गर्नुहोस्।{?documents} आवश्यक कागजात: {documents}।{/documents} सम्पर्क: {helpline_number}",
      type: "voice" as const,
      org_id: orgId,
      language: "ne",
    },
    {
      name: "डेलिभरी अपडेट",
      content:
        "अर्डर #{order_id}: स्थिति — {delivery_status}।{?estimated_time} अनुमानित समय: {estimated_time}।{/estimated_time} राइडर: {rider_name} ({rider_phone})",
      type: "text" as const,
      org_id: orgId,
      language: "ne",
    },
  ];

  const created: Array<{ id: string; name: string }> = [];
  for (const tmpl of templates) {
    try {
      const data = (await apiPost("/templates/", tmpl, token)) as {
        id: string;
        name: string;
      };
      created.push({ id: data.id, name: data.name });
    } catch (err) {
      console.warn(`Template seed skipped (may already exist): ${tmpl.name}`, err);
    }
  }
  return created;
}

async function seedCampaigns(
  token: string,
  orgId: string,
  templateIds: string[]
): Promise<Array<{ id: string; name: string; type: string }>> {
  const campaigns = [
    {
      name: "Voice Outreach — Bill Reminder",
      type: "voice" as const,
      org_id: orgId,
      template_id: templateIds[0] || undefined,
    },
    {
      name: "SMS Blast — Delivery Updates",
      type: "text" as const,
      org_id: orgId,
      template_id: templateIds[4] || undefined,
    },
    {
      name: "Customer Survey Q1",
      type: "form" as const,
      org_id: orgId,
      template_id: templateIds[2] || undefined,
    },
    {
      name: "KYC Reminder Campaign",
      type: "voice" as const,
      org_id: orgId,
      template_id: templateIds[3] || undefined,
    },
  ];

  const created: Array<{ id: string; name: string; type: string }> = [];
  for (const c of campaigns) {
    try {
      const data = (await apiPost("/campaigns/", c, token)) as {
        id: string;
        name: string;
        type: string;
      };
      created.push({ id: data.id, name: data.name, type: data.type });
    } catch (err) {
      console.warn(`Campaign seed skipped: ${c.name}`, err);
    }
  }
  return created;
}

async function seedContactsCSV(
  token: string,
  campaignId: string
): Promise<Array<{ id: string; phone: string; name: string }>> {
  const csvRows = [
    "phone,name,carrier,location",
    "+9779841000001,राम बहादुर,NTC,Kathmandu",
    "+9779841000002,सीता देवी,Ncell,Pokhara",
    "+9779841000003,हरि प्रसाद,NTC,Bhaktapur",
    "+9779841000004,गीता कुमारी,SmartCell,Lalitpur",
    "+9779841000005,बिष्णु थापा,NTC,Chitwan",
  ];
  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });

  const formData = new FormData();
  formData.append("file", blob, "contacts.csv");

  const res = await fetch(
    `${API_BASE_URL}/campaigns/${campaignId}/contacts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    console.warn(`Contact upload failed: ${text}`);
    return [];
  }

  // Fetch back the contacts
  const list = (await apiGet(
    `/campaigns/${campaignId}/contacts?page=1&page_size=50`,
    token
  )) as { items: Array<{ id: string; phone: string; name: string }> };

  return list.items || [];
}

export async function seedAll(): Promise<SeededData | null> {
  try {
    // 1. Register test user (may fail if already exists)
    let userId: string | undefined;
    try {
      const reg = await registerUser(TEST_USER);
      userId = reg.id;
    } catch {
      console.log("Test user may already exist, proceeding to login.");
    }

    // 2. Login
    const tokens = await loginUser(TEST_USER.email, TEST_USER.password);

    // 3. Get user profile to find org_id
    const profile = (await apiGet("/auth/user-profile", tokens.access_token)) as {
      id: string;
    };
    // For now use user ID as org_id (backend may auto-create org)
    const orgId = userId || profile.id;

    // 4. Seed templates
    const templates = await seedTemplates(tokens.access_token, orgId);
    const templateIds = templates.map((t) => t.id);

    // 5. Seed campaigns
    const campaigns = await seedCampaigns(
      tokens.access_token,
      orgId,
      templateIds
    );

    // 6. Upload contacts to first campaign
    let contacts: Array<{ id: string; phone: string; name: string }> = [];
    if (campaigns.length > 0) {
      contacts = await seedContactsCSV(tokens.access_token, campaigns[0].id);
    }

    console.log(
      `Seeded: ${templates.length} templates, ${campaigns.length} campaigns, ${contacts.length} contacts`
    );

    return {
      tokens,
      org_id: orgId,
      campaigns,
      templates,
      contacts,
    };
  } catch (err) {
    console.error("Seed failed — backend may not be running:", err);
    return null;
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const tokens = await loginUser(TEST_USER.email, TEST_USER.password);
    return tokens.access_token;
  } catch {
    console.warn("Could not obtain auth token — backend may not be running.");
    return null;
  }
}
