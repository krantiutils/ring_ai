"""Seed the database with sample Nepali templates."""

from app.core.database import SessionLocal
from app.models import Organization, Template
from app.services.templates import extract_variables

SEED_TEMPLATES = [
    {
        "name": "बिल भुक्तानी सम्झाउने (Bill Payment Reminder)",
        "content": (
            "नमस्ते {customer_name} जी। "
            "तपाईंको {service_name|सेवा} को बिल रु. {amount} बाँकी छ। "
            "भुक्तानीको अन्तिम मिति {due_date} हो। "
            "{?late_fee}ढिलो भुक्तानीमा रु. {late_fee} थप शुल्क लाग्नेछ। {/late_fee}"
            "कृपया समयमै भुक्तानी गर्नुहोस्। धन्यवाद।"
        ),
        "type": "voice",
        "voice_config": {
            "language": "ne-NP",
            "speed": 0.9,
            "voice_name": "ne-NP-SagarNeural",
        },
    },
    {
        "name": "OTP प्रमाणीकरण (OTP Verification)",
        "content": (
            "तपाईंको Ring AI प्रमाणीकरण कोड {otp_code} हो। "
            "यो कोड {expiry_minutes|५} मिनेटमा समाप्त हुनेछ। "
            "कसैलाई यो कोड नदिनुहोस्।"
        ),
        "type": "text",
        "voice_config": None,
    },
    {
        "name": "ग्राहक सन्तुष्टि सर्वेक्षण (Customer Satisfaction Survey)",
        "content": (
            "नमस्ते {customer_name} जी। म Ring AI बाट बोल्दैछु। "
            "तपाईंले हालै {service_name} सेवा प्रयोग गर्नुभएको थियो। "
            "तपाईंको अनुभवबारे केही प्रश्नहरू सोध्न चाहन्छु। "
            "{?agent_name}तपाईंको सेवा प्रदायक {agent_name} हुनुहुन्थ्यो। {/agent_name}"
            "कृपया १ देखि ५ सम्मको मूल्याङ्कन दिनुहोस्।"
        ),
        "type": "voice",
        "voice_config": {
            "language": "ne-NP",
            "speed": 0.85,
            "voice_name": "ne-NP-HemkalaNeural",
        },
    },
    {
        "name": "KYC सम्झाउने (KYC Reminder)",
        "content": (
            "नमस्ते {customer_name} जी। तपाईंको {account_type|खाता} को "
            "KYC अद्यावधिक गर्न बाँकी छ। "
            "कृपया {deadline} अगाडि आफ्नो नजिकको शाखा {branch_name|कार्यालय} मा "
            "आवश्यक कागजातहरू लिएर आउनुहोस्। "
            "{?documents}आवश्यक कागजात: {documents}। {/documents}"
            "थप जानकारीको लागि {helpline_number|१६६००} मा सम्पर्क गर्नुहोस्।"
        ),
        "type": "voice",
        "voice_config": {
            "language": "ne-NP",
            "speed": 0.9,
            "voice_name": "ne-NP-SagarNeural",
        },
    },
    {
        "name": "डेलिभरी अपडेट (Delivery Update)",
        "content": (
            "तपाईंको अर्डर #{order_id} को अवस्था: {delivery_status}। "
            "{?estimated_time}अनुमानित डेलिभरी समय: {estimated_time}। {/estimated_time}"
            "{?rider_name}डेलिभरी व्यक्ति: {rider_name}, फोन: {rider_phone|उपलब्ध छैन}। {/rider_name}"
            "ट्र्याक गर्न: {tracking_url|ring.ai/track}"
        ),
        "type": "text",
        "voice_config": None,
    },
]


def seed_templates() -> list[Template]:
    """Insert seed templates into the database. Returns created templates."""
    db = SessionLocal()
    created: list[Template] = []
    try:
        # Get or create a default organization for seeding
        org = db.query(Organization).first()
        if org is None:
            org = Organization(name="Ring AI (Seed)")
            db.add(org)
            db.flush()

        for data in SEED_TEMPLATES:
            variables = extract_variables(data["content"])
            template = Template(
                name=data["name"],
                content=data["content"],
                type=data["type"],
                org_id=org.id,
                variables=variables,
                voice_config=data["voice_config"],
            )
            db.add(template)
            created.append(template)

        db.commit()
        for t in created:
            db.refresh(t)
        return created
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    templates = seed_templates()
    for t in templates:
        print(f"Created: {t.name} (id={t.id}, type={t.type})")
    print(f"\nSeeded {len(templates)} templates.")
