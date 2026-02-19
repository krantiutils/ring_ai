import type { FlowEdge, FlowNode, Template } from "@/features/flows/builderTypes";

const edge = (id: string, source: string, target: string, sourceHandle?: string): FlowEdge => ({
  id,
  source,
  target,
  animated: true,
  ...(sourceHandle ? { sourceHandle } : {}),
});

const node = (
  id: string,
  x: number,
  y: number,
  kind: FlowNode["data"]["kind"],
  label: string,
  config: FlowNode["data"]["config"] = {},
): FlowNode => ({
  id,
  type: "flowNode",
  position: { x, y },
  data: { label, kind, config },
});

export const FLOW_TEMPLATES: Template[] = [
  {
    id: "simple-campaign",
    name: "Simple Campaign",
    description: "Manual/CSV source -> validation -> SMS blast",
    nodes: [
      node("ts", 20, 50, "trigger_manual", "Manual Trigger"),
      node("ss", 20, 190, "source_manual_table", "Manual Table", { table_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" }),
      node("vs", 20, 330, "validation", "Validate Contacts", { required_columns: "name,phone" }),
      node("smss", 300, 330, "agent_sms", "SMS Agent", { message: "Namaste {{name}}, यो AgentShakti campaign सन्देश हो।" }),
      node("oks", 560, 300, "end_success", "End Success"),
      node("fails", 560, 420, "end_failure", "End Failure"),
    ],
    edges: [
      edge("es1", "ts", "ss"),
      edge("es2", "ss", "vs"),
      edge("es3", "vs", "smss", "valid"),
      edge("es4", "smss", "oks"),
      edge("es5", "vs", "fails", "invalid"),
    ],
  },
  {
    id: "payment-reminder",
    name: "Payment Reminder",
    description: "CSV -> validate -> business hours -> SMS -> Voice fallback",
    nodes: [
      node("t1", 20, 50, "trigger_schedule", "Schedule Trigger", { cron: "0 10 * * *" }),
      node("s1", 20, 190, "source_csv", "CSV Contacts", { required_columns: "name,phone,due_amount" }),
      node("v1", 20, 330, "validation", "Validate Contacts", { required_columns: "name,phone,due_amount" }),
      node("b1", 20, 470, "business_hours", "Business Hours", { timezone: "Asia/Kathmandu", window: "09:00-18:00" }),
      node("sms1", 290, 470, "agent_sms", "SMS Agent", { message: "Namaste {{name}}, tapai ko due {{due_amount}} cha." }),
      node("voice1", 560, 470, "agent_voice", "Voice Agent", { script: "यो भुक्तानी रिमाइन्डर कल हो।" }),
      node("ok1", 830, 430, "end_success", "End Success"),
      node("fail1", 830, 540, "end_failure", "End Failure"),
    ],
    edges: [
      edge("e1", "t1", "s1"),
      edge("e2", "s1", "v1"),
      edge("e3", "v1", "b1", "valid"),
      edge("e4", "b1", "sms1"),
      edge("e5", "sms1", "voice1"),
      edge("e6", "voice1", "ok1"),
      edge("e7", "v1", "fail1", "invalid"),
    ],
  },
  {
    id: "appointment-followup",
    name: "Appointment Follow-up",
    description: "XLSX source with condition-based branch + wait node",
    nodes: [
      node("t2", 20, 50, "trigger_manual", "Manual Trigger"),
      node("x1", 20, 190, "source_xlsx", "XLSX Source", { required_columns: "name,phone,appointment_date,age,gender" }),
      node("v2", 20, 330, "validation", "Validate Sheet", { required_columns: "name,phone,appointment_date" }),
      node("c2", 300, 330, "condition", "Condition: age > 30", { field: "age", operator: ">", value: "30" }),
      node("sms2", 560, 250, "agent_sms", "SMS Reminder", { message: "Appointment reminder: {{appointment_date}}" }),
      node("w2", 560, 410, "wait", "Wait 2 Hours", { duration_minutes: "120" }),
      node("voice2", 800, 410, "agent_voice", "Voice Follow-up", { script: "हामी तपाईंको अपोइन्टमेन्ट सम्झाउन फोन गरेका हौं।" }),
      node("ok2", 1040, 300, "end_success", "End Success"),
      node("fail2", 1040, 470, "end_failure", "End Failure"),
    ],
    edges: [
      edge("e21", "t2", "x1"),
      edge("e22", "x1", "v2"),
      edge("e23", "v2", "c2", "valid"),
      edge("e24", "c2", "sms2", "true"),
      edge("e25", "c2", "w2", "false"),
      edge("e26", "w2", "voice2"),
      edge("e27", "sms2", "ok2"),
      edge("e28", "voice2", "ok2"),
      edge("e29", "v2", "fail2", "invalid"),
    ],
  },
  {
    id: "otp-demo-call",
    name: "OTP Demo Call",
    description: "Number source -> validation -> rate-limit -> voice + error handler",
    nodes: [
      node("t3", 20, 50, "trigger_manual", "Manual Trigger"),
      node("n3", 20, 190, "source_numbers", "Number Source", { numbers: "+9779800000000,+9779811111111" }),
      node("v3", 20, 330, "validation", "Validation", { required_columns: "phone" }),
      node("r3", 280, 330, "rate_limit", "Rate Limit", { per_minute: "20" }),
      node("sn3", 540, 330, "sender_number", "Sender Number", { number: "+19704701940" }),
      node("a3", 800, 330, "agent_voice", "Voice Agent", { script: "नमस्ते, AgentShakti डेमो कलमा स्वागत छ।" }),
      node("er3", 800, 480, "error_handler", "Error Handler", { retries: "2" }),
      node("ok3", 1060, 280, "end_success", "End Success"),
      node("fail3", 1060, 480, "end_failure", "End Failure"),
    ],
    edges: [
      edge("e31", "t3", "n3"),
      edge("e32", "n3", "v3"),
      edge("e33", "v3", "r3"),
      edge("e34", "r3", "sn3"),
      edge("e35", "sn3", "a3"),
      edge("e36", "a3", "ok3"),
      edge("e37", "a3", "er3"),
      edge("e38", "er3", "fail3"),
    ],
  },
];

export const DEFAULT_FLOW = FLOW_TEMPLATES[0];
