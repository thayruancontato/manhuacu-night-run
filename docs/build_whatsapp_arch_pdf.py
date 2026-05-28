from __future__ import annotations

from pathlib import Path
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "arquitetura-whatsapp-mcu-nightrun.pdf"
LOGO = ROOT / "app" / "public" / "LOGO NIGHT RUN SEM FUNDO (em amarelo).png"

NAVY = colors.HexColor("#1B2150")
NAVY_2 = colors.HexColor("#101735")
LIME = colors.HexColor("#D4E926")
CYAN = colors.HexColor("#3AA7FF")
GREEN = colors.HexColor("#22C55E")
ORANGE = colors.HexColor("#F59E0B")
RED = colors.HexColor("#EF4444")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#65738A")
LINE = colors.HexColor("#D8DEE8")
PANEL = colors.HexColor("#F5F7FB")
PANEL_2 = colors.HexColor("#EEF2F7")
WHITE = colors.white


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=33,
        textColor=WHITE,
        alignment=TA_LEFT,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        "CoverSub",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=11,
        leading=16,
        textColor=colors.HexColor("#E8EDFF"),
        alignment=TA_LEFT,
    )
)
styles.add(
    ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=23,
        textColor=NAVY,
        spaceBefore=8,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=16,
        textColor=NAVY,
        spaceBefore=9,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.4,
        leading=13.3,
        textColor=INK,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        "Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        "CodeBox",
        parent=styles["BodyText"],
        fontName="Courier",
        fontSize=8.2,
        leading=11.5,
        textColor=colors.HexColor("#0F172A"),
        backColor=colors.HexColor("#F1F5F9"),
        borderPadding=6,
        leftIndent=0,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        "Kpi",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=19,
        alignment=TA_CENTER,
        textColor=NAVY,
    )
)
styles.add(
    ParagraphStyle(
        "KpiLabel",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9,
        alignment=TA_CENTER,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        "TableHeader",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.6,
        leading=9.6,
        textColor=WHITE,
    )
)
styles.add(
    ParagraphStyle(
        "TableCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.4,
        textColor=colors.HexColor("#0F172A"),
    )
)


def p(text: str, style: str = "Body") -> Paragraph:
    return Paragraph(text, styles[style])


def bullets(items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item, "Body"), leftIndent=10) for item in items],
        bulletType="bullet",
        start="circle",
        bulletFontName="Helvetica",
        bulletFontSize=7,
        leftIndent=14,
    )


class Rule(Flowable):
    def __init__(self, color=LINE, width=1):
        super().__init__()
        self.color = color
        self.width = width
        self.height = 8

    def wrap(self, availWidth, availHeight):
        self.availWidth = availWidth
        return availWidth, self.height

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.width)
        self.canv.line(0, self.height / 2, self.availWidth, self.height / 2)


class Callout(Flowable):
    def __init__(self, title: str, body: str, tone: str = "blue", width: float = 0):
        super().__init__()
        self.title = title
        self.body = body
        self.tone = tone
        self.width = width
        self.pad = 9

    def wrap(self, availWidth, availHeight):
        self.width = self.width or availWidth
        self.title_p = Paragraph(f"<b>{self.title}</b>", styles["Body"])
        self.body_p = Paragraph(self.body, styles["Body"])
        _, th = self.title_p.wrap(self.width - 2 * self.pad, availHeight)
        _, bh = self.body_p.wrap(self.width - 2 * self.pad, availHeight)
        self.height = th + bh + 2 * self.pad + 2
        return self.width, self.height

    def draw(self):
        color = {"blue": CYAN, "green": GREEN, "orange": ORANGE, "red": RED}.get(self.tone, CYAN)
        self.canv.setFillColor(colors.HexColor("#F8FAFC"))
        self.canv.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.canv.roundRect(0, 0, self.width, self.height, 6, fill=1, stroke=1)
        self.canv.setFillColor(color)
        self.canv.roundRect(0, 0, 6, self.height, 3, fill=1, stroke=0)
        y = self.height - self.pad
        tw, th = self.title_p.wrap(self.width - 2 * self.pad, self.height)
        self.title_p.drawOn(self.canv, self.pad + 4, y - th)
        y -= th + 3
        bw, bh = self.body_p.wrap(self.width - 2 * self.pad, self.height)
        self.body_p.drawOn(self.canv, self.pad + 4, y - bh)


class CoverHero(Flowable):
    def __init__(self):
        super().__init__()
        self.height = 205 * mm

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(NAVY)
        c.roundRect(0, 0, self.width, self.height, 16, fill=1, stroke=0)
        c.setFillColor(NAVY_2)
        c.circle(self.width - 60, self.height - 35, 92, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#26306C"))
        c.circle(self.width - 16, 22, 76, fill=1, stroke=0)
        c.setFillColor(LIME)
        c.roundRect(24, self.height - 40, 188, 17, 8, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(34, self.height - 35, "DOCUMENTO TECNICO DE ARQUITETURA")
        if LOGO.exists():
            try:
                img = ImageReader(str(LOGO))
                c.drawImage(img, 26, self.height - 105, width=60, height=60, preserveAspectRatio=True, mask="auto")
            except Exception:
                pass
        title = Paragraph("Arquitetura WhatsApp<br/>MCU Night Run", styles["CoverTitle"])
        _, th = title.wrap(self.width - 64, 80)
        title_y = self.height - 136 - th
        title.drawOn(c, 28, title_y)
        sub = Paragraph(
            "Camada de mensageria baseada em Cloudflare Worker, Cloudflare Tunnel, Evolution API, Redis, Neon Postgres e Firebase. "
            "Inclui topologia, fluxos de envio, persistencia, operacao, seguranca e runbook.",
            styles["CoverSub"],
        )
        _, sh = sub.wrap(self.width - 64, 60)
        sub.drawOn(c, 28, title_y - sh - 16)
        # Mini topology line
        y = 42
        labels = ["App", "Worker", "Tunnel", "Evolution", "WhatsApp"]
        x0 = 30
        gap = (self.width - 80) / (len(labels) - 1)
        for i, label in enumerate(labels):
            x = x0 + i * gap
            c.setFillColor(WHITE)
            c.circle(x, y, 12, fill=1, stroke=0)
            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 6)
            c.drawCentredString(x, y - 2, str(i + 1))
            c.setFillColor(WHITE)
            c.setFont("Helvetica", 7)
            c.drawCentredString(x, y - 25, label)
            if i < len(labels) - 1:
                c.setStrokeColor(LIME)
                c.setLineWidth(2)
                c.line(x + 15, y, x0 + (i + 1) * gap - 15, y)


class BoxDiagram(Flowable):
    def __init__(self, variant: str):
        super().__init__()
        self.variant = variant
        self.height = {"architecture": 106 * mm, "network": 98 * mm, "message": 105 * mm, "queue": 92 * mm}.get(variant, 90 * mm)

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def box(self, x, y, w, h, title, sub="", fill=PANEL, stroke=LINE, accent=None):
        c = self.canv
        c.setFillColor(fill)
        c.setStrokeColor(stroke)
        c.roundRect(x, y, w, h, 7, fill=1, stroke=1)
        if accent:
            c.setFillColor(accent)
            c.roundRect(x, y + h - 5, w, 5, 3, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + w / 2, y + h - 15, title)
        if sub:
            small_style = ParagraphStyle(
                "DiagramSmallLocal",
                parent=styles["Small"],
                fontSize=6.8,
                leading=8.2,
                alignment=TA_CENTER,
            )
            text = Paragraph(sub, small_style)
            tw, th = text.wrap(w - 12, h - 20)
            text.drawOn(c, x + 6, max(y + 5, y + h - 20 - th))

    def arrow(self, x1, y1, x2, y2, label=""):
        c = self.canv
        c.setStrokeColor(CYAN)
        c.setLineWidth(1.4)
        c.line(x1, y1, x2, y2)
        # arrow head
        import math

        ang = math.atan2(y2 - y1, x2 - x1)
        size = 5
        p1 = (x2 - size * math.cos(ang - 0.5), y2 - size * math.sin(ang - 0.5))
        p2 = (x2 - size * math.cos(ang + 0.5), y2 - size * math.sin(ang + 0.5))
        c.setFillColor(CYAN)
        c.line(x2, y2, p1[0], p1[1])
        c.line(x2, y2, p2[0], p2[1])
        if label:
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 6.5)
            c.drawCentredString((x1 + x2) / 2, (y1 + y2) / 2 + 5, label)

    def draw_architecture(self):
        w = self.width
        y_top = self.height - 35
        self.box(8, y_top - 46, 78, 46, "Frontend", "Firebase Hosting<br/>React/Vite", accent=LIME)
        self.box(112, y_top - 46, 86, 46, "Cloudflare Worker", "API publica<br/>KV + cron", accent=CYAN)
        self.box(224, y_top - 46, 92, 46, "Evolution API", "Servidor WhatsApp<br/>Baileys", accent=GREEN)
        self.box(342, y_top - 46, 72, 46, "WhatsApp", "Rede externa<br/>Entrega", accent=ORANGE)
        self.arrow(86, y_top - 21, 112, y_top - 21, "HTTPS")
        self.arrow(198, y_top - 21, 224, y_top - 21, "Tunnel")
        self.arrow(316, y_top - 21, 342, y_top - 21, "Baileys")
        y2 = y_top - 100
        self.box(42, y2, 92, 42, "Firestore", "Inscricoes<br/>Logs", accent=NAVY)
        self.box(162, y2, 82, 42, "KV Namespace", "Fila<br/>Pausa", accent=CYAN)
        self.box(272, y2, 75, 42, "Redis", "Cache<br/>AOF", accent=RED)
        self.box(375, y2, 75, 42, "Neon", "Postgres<br/>Prisma", accent=GREEN)
        self.arrow(155, y_top - 46, 108, y2 + 42, "REST")
        self.arrow(155, y_top - 46, 203, y2 + 42, "fila")
        self.arrow(270, y_top - 46, 310, y2 + 42, "cache")
        self.arrow(290, y_top - 46, 412, y2 + 42, "SQL")

    def draw_network(self):
        w = self.width
        self.box(20, self.height - 54, 120, 44, "DNS Cloudflare", "mcunightrun.com.br<br/>whatsapp.mcunightrun.com.br", accent=CYAN)
        self.box(170, self.height - 54, 130, 44, "Cloudflare Edge", "TLS publico<br/>WAF/proxy<br/>roteamento global", accent=LIME)
        self.box(330, self.height - 54, 112, 44, "cloudflared", "container local<br/>tunnel mcu-nightrun-whatsapp", accent=GREEN)
        self.arrow(140, self.height - 32, 170, self.height - 32, "resolve")
        self.arrow(300, self.height - 32, 330, self.height - 32, "QUIC")
        self.box(58, self.height - 122, 118, 42, "Worker", "workers.dev<br/>/whatsapp/*", accent=NAVY)
        self.box(232, self.height - 122, 118, 42, "Evolution API", "127.0.0.1:8080<br/>exposta apenas ao host", accent=ORANGE)
        self.box(375, self.height - 122, 75, 42, "Docker Net", "service DNS:<br/>evolution-api:8080", accent=CYAN)
        self.arrow(117, self.height - 80, 117, self.height - 54, "publico")
        self.arrow(290, self.height - 80, 386, self.height - 54, "origem")
        self.arrow(350, self.height - 101, 375, self.height - 101, "bridge")

    def draw_message(self):
        labels = [
            ("1", "Evento", "inscricao, pagamento, admin"),
            ("2", "Worker", "valida e monta payload"),
            ("3", "Fila KV", "opcional: mq:pending"),
            ("4", "Evolution", "sendText/sendMedia"),
            ("5", "WhatsApp", "entrega ao atleta"),
            ("6", "Firestore", "log de sucesso/erro"),
        ]
        x = 12
        y = self.height - 48
        for idx, title, sub in labels[:3]:
            self.box(x, y, 120, 42, f"{idx}. {title}", sub, accent=CYAN if idx != "3" else LIME)
            x += 152
        self.arrow(132, y + 21, 164, y + 21, "POST")
        self.arrow(284, y + 21, 316, y + 21, "put")
        x = 82
        y2 = self.height - 122
        for idx, title, sub in labels[3:]:
            self.box(x, y2, 120, 42, f"{idx}. {title}", sub, accent=GREEN if idx == "4" else ORANGE if idx == "5" else NAVY)
            x += 152
        self.arrow(376, self.height - 90, 202, y2 + 42, "cron")
        self.arrow(202, y2 + 21, 234, y2 + 21, "HTTP")
        self.arrow(354, y2 + 21, 386, y2 + 21, "status")

    def draw_queue(self):
        self.box(20, self.height - 48, 122, 38, "Entrada", "queueMessage(msg)<br/>gera chave mq:pending", accent=CYAN)
        self.box(182, self.height - 48, 122, 38, "KV", "persistencia leve<br/>limite 15 por ciclo", accent=LIME)
        self.box(344, self.height - 48, 102, 38, "Cron", "* * * * *<br/>processQueue", accent=NAVY)
        self.arrow(142, self.height - 29, 182, self.height - 29, "put")
        self.arrow(304, self.height - 29, 344, self.height - 29, "list")
        self.box(104, self.height - 112, 122, 38, "Envio", "4s entre mensagens<br/>presence composing", accent=GREEN)
        self.box(270, self.height - 112, 122, 38, "Resultado", "delete se sucesso<br/>log Firestore", accent=ORANGE)
        self.arrow(395, self.height - 48, 180, self.height - 74, "processa")
        self.arrow(226, self.height - 93, 270, self.height - 93, "retorno")

    def draw(self):
        self.canv.setFillColor(WHITE)
        self.canv.setStrokeColor(LINE)
        self.canv.roundRect(0, 0, self.width, self.height, 10, fill=1, stroke=1)
        if self.variant == "architecture":
            self.draw_architecture()
        elif self.variant == "network":
            self.draw_network()
        elif self.variant == "message":
            self.draw_message()
        elif self.variant == "queue":
            self.draw_queue()


def table(data, widths, header=True):
    wrapped = []
    for r, row in enumerate(data):
        wrapped_row = []
        for cell in row:
            if isinstance(cell, Flowable):
                wrapped_row.append(cell)
            else:
                txt = str(cell).replace("\n", "<br/>")
                wrapped_row.append(Paragraph(txt, styles["TableHeader"] if header and r == 0 else styles["TableCell"]))
        wrapped.append(wrapped_row)
    t = Table(wrapped, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    style = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.8),
        ("LEADING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F8FAFC")]),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    t.setStyle(TableStyle(style))
    return t


def kpi_row(items):
    cells = []
    for value, label, color in items:
        cells.append(
            [
                Paragraph(f'<font color="{color}">{value}</font>', styles["Kpi"]),
                Paragraph(label, styles["KpiLabel"]),
            ]
        )
    data = [[Table([[cell[0]], [cell[1]]], colWidths=[42 * mm]) for cell in cells]]
    t = Table(data, colWidths=[45 * mm] * len(items), hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def on_first_page(canvas, doc):
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)


def on_later_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 18 * mm, A4[0], 18 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(16 * mm, A4[1] - 11 * mm, "MCU Night Run | Arquitetura WhatsApp")
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(A4[0] - 16 * mm, A4[1] - 11 * mm, f"Pagina {doc.page}")
    canvas.setStrokeColor(LIME)
    canvas.setLineWidth(1.6)
    canvas.line(16 * mm, 13 * mm, A4[0] - 16 * mm, 13 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(16 * mm, 8 * mm, "Documento tecnico. Segredos, tokens e connection strings foram omitidos.")
    canvas.restoreState()


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=25 * mm,
        bottomMargin=18 * mm,
        title="Arquitetura WhatsApp MCU Night Run",
        author="Codex",
        subject="Arquitetura tecnica do servidor WhatsApp do MCU Night Run",
    )
    story = []
    story.append(CoverHero())
    story.append(Spacer(1, 8 * mm))
    meta = table(
        [
            ["Versao", "Data", "Ambiente", "Escopo"],
            ["1.0", "15/05/2026", "Producao operacional", "WhatsApp, Worker, Tunnel, Redis, Neon, Firebase"],
        ],
        [24 * mm, 30 * mm, 45 * mm, 72 * mm],
    )
    story.append(meta)
    story.append(PageBreak())

    story.append(p("1. Sumario Executivo", "H1"))
    story.append(
        p(
            "A arquitetura WhatsApp do MCU Night Run separa o frontend publico, a API de aplicacao e o motor de mensageria. "
            "O aplicativo React hospedado no Firebase chama um Cloudflare Worker. O Worker atua como camada de seguranca, proxy, fila e orquestrador. "
            "A entrega das mensagens e feita por uma Evolution API privada, publicada apenas por Cloudflare Tunnel em <b>whatsapp.mcunightrun.com.br</b>.",
            "Body",
        )
    )
    story.append(
        kpi_row(
            [
                ("3", "containers em execucao", "#1B2150"),
                ("1", "instancia WhatsApp", "#1B2150"),
                ("1 min", "ciclo de fila cron", "#1B2150"),
                ("0", "segredos no PDF", "#1B2150"),
            ]
        )
    )
    story.append(Spacer(1, 5 * mm))
    story.append(
        Callout(
            "Resultado atual",
            "A infraestrutura esta publicada e acessivel via Cloudflare Tunnel. A instancia <b>mcu_nightrun_uba</b> existe; quando estiver desconectada, basta gerar o QR pelo endpoint <b>/whatsapp/connect</b> e parear o aparelho.",
            "green",
        )
    )
    story.append(p("Principios de desenho", "H2"))
    story.append(
        bullets(
            [
                "<b>Fronteira publica unica:</b> o app nao fala diretamente com a Evolution API; todo trafego passa pelo Worker.",
                "<b>Origem protegida:</b> a Evolution escuta localmente em 127.0.0.1:8080 e e exposta externamente apenas pelo Tunnel.",
                "<b>Estado separado:</b> mensagens e logs operacionais ficam em Firestore/KV; metadados internos da Evolution ficam no Neon.",
                "<b>Operacao recuperavel:</b> Docker Compose reinicia containers; Redis usa AOF; Neon persiste o banco gerenciado.",
            ]
        )
    )
    story.append(PageBreak())

    story.append(p("2. Visao Geral da Topologia", "H1"))
    story.append(p("Diagrama de componentes principais", "H2"))
    story.append(BoxDiagram("architecture"))
    story.append(Spacer(1, 4 * mm))
    story.append(
        p(
            "O Worker concentra as regras de negocio que conectam inscricoes, pagamentos e mensagens. A Evolution API fica dedicada ao protocolo WhatsApp/Baileys, reduzindo o acoplamento entre o sistema do evento e a sessao do WhatsApp.",
            "Body",
        )
    )
    story.append(
        table(
            [
                ["Camada", "Componente", "Responsabilidade", "Estado mantido"],
                ["Frontend", "Firebase Hosting + React", "Cadastro, painel admin, chamadas HTTP para Worker", "Estado de UI e dados Firestore"],
                ["API", "Cloudflare Worker", "Proxy, fila, cron, upload R2, Asaas, WhatsApp", "KV para fila e flag de pausa"],
                ["Mensageria", "Evolution API v2.3.7", "Sessao WhatsApp, QR, envio texto/midia", "Instancias e mensagens no Neon"],
                ["Persistencia", "Neon Postgres", "Banco da Evolution e migracoes Prisma", "Tabelas internas da Evolution"],
                ["Cache", "Redis 7", "Cache e estado rapido da Evolution", "Chaves Redis com AOF"],
                ["Rede", "Cloudflare Tunnel", "Publicacao segura da API privada", "Conexoes QUIC ativas"],
            ],
            [25 * mm, 38 * mm, 68 * mm, 43 * mm],
        )
    )
    story.append(PageBreak())

    story.append(p("3. Rede, DNS e Exposicao Publica", "H1"))
    story.append(BoxDiagram("network"))
    story.append(
        p(
            "O dominio <b>mcunightrun.com.br</b> passou a ser gerenciado por Cloudflare DNS. O site principal continua apontando para Firebase Hosting via registro A <b>199.36.158.100</b>. "
            "O subdominio <b>whatsapp.mcunightrun.com.br</b> e roteado pelo tunnel <b>mcu-nightrun-whatsapp</b> para o servico interno <b>http://evolution-api:8080</b> na rede Docker.",
            "Body",
        )
    )
    story.append(
        table(
            [
                ["Host", "Destino", "Proxy", "Uso"],
                ["mcunightrun.com.br", "199.36.158.100", "DNS only recomendado para validacao Firebase", "Site publico Firebase Hosting"],
                ["www.mcunightrun.com.br", "mcunightrun.com.br", "DNS only", "Alias do site principal"],
                ["whatsapp.mcunightrun.com.br", "Cloudflare Tunnel", "Proxy Cloudflare", "Origem publica segura da Evolution API"],
            ],
            [43 * mm, 48 * mm, 42 * mm, 42 * mm],
        )
    )
    story.append(
        Callout(
            "Importante sobre origem",
            "A porta Docker publicada e <b>127.0.0.1:8080</b>, nao 0.0.0.0. Isso impede exposicao direta pela rede local. O acesso publico ocorre pela conexao outbound do cloudflared.",
            "blue",
        )
    )
    story.append(PageBreak())

    story.append(p("4. Fluxo de Envio de Mensagens", "H1"))
    story.append(BoxDiagram("message"))
    story.append(p("Caminhos principais", "H2"))
    story.append(
        bullets(
            [
                "<b>Boas-vindas / PIX:</b> apos a inscricao, o PublicForm chama o Worker em <b>/whatsapp/send</b> com texto e imagem opcional.",
                "<b>Pagamento confirmado:</b> o webhook Asaas atualiza Firestore e enfileira uma confirmacao em <b>queueMessage</b>.",
                "<b>Sorteio surpresa:</b> se uma regra de sorteio for acionada, o Worker registra o premio e enfileira mensagem especifica.",
                "<b>Envios administrativos:</b> paginas admin usam o Worker para disparos diretos, historico e fila.",
            ]
        )
    )
    story.append(
        p(
            "Para mensagens com imagem, o Worker baixa a midia por URL, converte para base64 e envia pela rota <b>/message/sendMedia/{INSTANCE_NAME}</b>. "
            "Mensagens sem midia usam <b>/message/sendText/{INSTANCE_NAME}</b>. O payload inclui delay e presence composing para reduzir comportamento brusco de envio.",
            "Body",
        )
    )
    story.append(PageBreak())

    story.append(p("5. Fila, Cron e Controle de Ritmo", "H1"))
    story.append(BoxDiagram("queue"))
    story.append(
        p(
            "A fila do Worker usa Cloudflare KV como buffer leve. Cada mensagem pendente recebe chave no formato <b>mq:pending:{timestamp}:{random}</b>. "
            "O cron roda a cada minuto, consulta ate 15 chaves por ciclo, envia pela Evolution e remove a chave somente apos resultado tratado.",
            "Body",
        )
    )
    story.append(
        table(
            [
                ["Elemento", "Valor / comportamento", "Finalidade operacional"],
                ["Prefixo pendente", "mq:pending:*", "Localizar mensagens ainda nao processadas"],
                ["Flag de pausa", "mq:paused", "Interromper disparos sem derrubar infraestrutura"],
                ["Lote por ciclo", "15 mensagens", "Limitar rajadas e controlar consumo"],
                ["Intervalo entre envios", "4 segundos", "Reduzir risco de bloqueio por disparo agressivo"],
                ["Log", "Firestore whatsapp_logs", "Auditar sucesso, erro, destinatario e tipo"],
            ],
            [42 * mm, 58 * mm, 75 * mm],
        )
    )
    story.append(
        Callout(
            "Limite de desenho",
            "Cloudflare KV e suficiente para fila simples, mas nao entrega semantica forte de fila transacional. Para volumes maiores, recomenda-se migrar para Cloudflare Queues, Durable Objects ou uma fila dedicada.",
            "orange",
        )
    )
    story.append(PageBreak())

    story.append(p("6. Contratos de API do Worker", "H1"))
    story.append(
        table(
            [
                ["Endpoint", "Metodo", "Destino interno", "Uso"],
                ["/whatsapp/status", "GET", "/instance/connectionState/{INSTANCE_NAME}", "Verificar estado open, connecting ou close"],
                ["/whatsapp/create", "POST", "/instance/create", "Criar instancia Baileys com QR habilitado"],
                ["/whatsapp/connect", "GET", "/instance/connect/{INSTANCE_NAME}", "Gerar QR ou reconectar instancia"],
                ["/whatsapp/logout", "POST", "/instance/logout/{INSTANCE_NAME}", "Encerrar sessao atual"],
                ["/whatsapp/send", "POST", "/message/sendText ou sendMedia", "Enviar texto ou midia para numero normalizado"],
                ["/queue/process", "POST", "processQueue(env)", "Forcar processamento manual da fila"],
                ["/queue/toggle-pause", "POST", "KV mq:paused", "Pausar ou retomar fila"],
            ],
            [42 * mm, 22 * mm, 58 * mm, 53 * mm],
        )
    )
    story.append(p("Contrato de envio simplificado", "H2"))
    story.append(
        p(
            '{<br/>'
            '&nbsp;&nbsp;"phone": "5532999999999",<br/>'
            '&nbsp;&nbsp;"text": "Mensagem ao atleta",<br/>'
            '&nbsp;&nbsp;"imageUrl": "https://.../imagem.png" // opcional<br/>'
            "}",
            "CodeBox",
        )
    )
    story.append(
        p(
            "O Worker e responsavel por adicionar cabecalhos <b>apikey</b>, selecionar endpoint de texto ou midia e encapsular resposta como <b>{ success, status, response }</b>.",
            "Body",
        )
    )
    story.append(PageBreak())

    story.append(p("7. Persistencia e Donos dos Dados", "H1"))
    story.append(
        table(
            [
                ["Dado", "Fonte da verdade", "Consumidores", "Retencao / observacao"],
                ["Inscricao e pagamento", "Firestore nightrun_registrations", "App, Worker, admin", "Dados principais do atleta e status de pagamento"],
                ["Logs WhatsApp", "Firestore whatsapp_logs", "Admin mensagens, auditoria", "Resumo de destinatario, status, erro e tipo"],
                ["Fila pendente", "Cloudflare KV NIGHTRUN_STORAGE", "Worker cron", "Ephemeral ate envio com sucesso"],
                ["Midias uploadadas", "Cloudflare R2 MEDIA_BUCKET", "App e mensagens", "Objetos de imagem e anexos"],
                ["Estado Evolution", "Neon Postgres", "Evolution API", "Instancias, chats, mensagens, contatos e configuracoes internas"],
                ["Cache Evolution", "Redis", "Evolution API", "Estado rapido e cache de instancia"],
            ],
            [36 * mm, 48 * mm, 43 * mm, 49 * mm],
        )
    )
    story.append(
        p(
            "A separacao e intencional: o sistema do evento nao depende de detalhes internos da Evolution. Se a Evolution for trocada no futuro, o contrato a preservar e o Worker, nao o frontend.",
            "Body",
        )
    )
    story.append(PageBreak())

    story.append(p("8. Ciclo de Vida da Instancia WhatsApp", "H1"))
    story.append(
        table(
            [
                ["Estado", "Significado", "Acao recomendada"],
                ["close", "Sessao fechada ou nao pareada", "Chamar /whatsapp/connect e escanear QR"],
                ["connecting", "QR emitido ou tentativa de conexao em andamento", "Aguardar pareamento; se expirar, gerar novo QR"],
                ["open", "WhatsApp conectado", "Liberar disparos; monitorar logs e fila"],
            ],
            [28 * mm, 82 * mm, 66 * mm],
        )
    )
    story.append(p("Procedimento de pareamento", "H2"))
    story.append(
        bullets(
            [
                "Acesse <b>/whatsapp/status</b> pelo Worker para confirmar o estado.",
                "Se estiver <b>close</b>, acesse <b>/whatsapp/connect</b> para obter o QR.",
                "No celular do WhatsApp, use <b>Aparelhos conectados</b> e escaneie o QR.",
                "Repita <b>/whatsapp/status</b> ate retornar <b>open</b>.",
            ]
        )
    )
    story.append(
        Callout(
            "Cuidado operacional",
            "Nao compartilhe QR em canais publicos. Ele concede acesso a uma sessao WhatsApp. Gere o QR apenas quando alguem autorizado estiver pronto para parear.",
            "red",
        )
    )
    story.append(PageBreak())

    story.append(p("9. Seguranca e Segredos", "H1"))
    story.append(
        p(
            "A arquitetura ja possui uma boa fronteira de seguranca: o frontend nao carrega a chave da Evolution; a API privada nao fica exposta diretamente; o tunnel usa conexao outbound; e a origem local fica restrita ao host. "
            "Ainda assim, ha medidas importantes para endurecer o ambiente.",
            "Body",
        )
    )
    story.append(
        table(
            [
                ["Tema", "Estado atual", "Recomendacao"],
                ["Evolution API key", "Usada no Worker e no .env local", "Migrar de wrangler.toml para wrangler secret"],
                ["Cloudflare Tunnel token", "Guardado no .env privado", "Rotacionar se for exposto em conversa ou print"],
                ["Neon connection string", "Guardada no .env privado", "Usar role dedicada e rotacionar se exposta"],
                ["Firebase API key", "Publica por natureza, mas deve ter regras Firestore fortes", "Revisar regras e App Check se necessario"],
                ["Worker CORS", "Allow-Origin amplo", "Restringir em producao para dominios do app"],
                ["WhatsApp QR", "Gerado sob demanda", "Tratar como segredo temporario"],
            ],
            [42 * mm, 59 * mm, 75 * mm],
        )
    )
    story.append(
        Callout(
            "Prioridade alta",
            "Mover chaves de <b>wrangler.toml</b> para <b>wrangler secret</b>. O TOML e arquivo de configuracao versionavel; segredos devem viver no cofre da Cloudflare.",
            "orange",
        )
    )
    story.append(PageBreak())

    story.append(p("10. Operacao, Monitoramento e Diagnostico", "H1"))
    story.append(p("Comandos essenciais", "H2"))
    story.append(
        p(
            "cd infra/evolution<br/>"
            "docker compose ps<br/>"
            "docker logs -f nightrun_evolution_api<br/>"
            "docker logs -f nightrun_evolution_tunnel<br/>"
            "docker compose up -d redis evolution-api cloudflared",
            "CodeBox",
        )
    )
    story.append(
        table(
            [
                ["Sintoma", "Verificacao", "Causa provavel", "Acao"],
                ["Worker retorna close", "/whatsapp/status", "Sessao desconectada", "Gerar QR em /whatsapp/connect"],
                ["URL whatsapp nao abre", "docker logs tunnel", "Rota ou tunnel fora", "Revisar Public Hostname e cloudflared"],
                ["Evolution reiniciando", "docker logs api", "Erro de banco/env", "Validar .env e Neon"],
                ["Mensagens paradas", "/queue/toggle-pause e KV", "Fila pausada ou erro de envio", "Retomar fila e checar logs"],
                ["Imagem nao envia", "response Evolution", "Download/base64/mimetype", "Testar URL publica e tamanho da midia"],
            ],
            [32 * mm, 39 * mm, 48 * mm, 57 * mm],
        )
    )
    story.append(PageBreak())

    story.append(p("11. Deploy e Mudancas Controladas", "H1"))
    story.append(
        bullets(
            [
                "<b>Infra Evolution:</b> alterar <b>infra/evolution/.env</b> e executar <b>docker compose up -d</b>.",
                "<b>Worker:</b> alterar configuracao/codigo e publicar com <b>npx wrangler deploy</b>.",
                "<b>DNS/Tunnel:</b> mudar rotas no painel Cloudflare Zero Trust; confirmar logs do cloudflared.",
                "<b>Rollback:</b> manter o compose e o Worker atual como unidade de mudanca; em falha, voltar TOML/codigo anterior e redeploy.",
            ]
        )
    )
    story.append(
        table(
            [
                ["Mudanca", "Risco", "Janela recomendada", "Teste de aceite"],
                ["Trocar API key Evolution", "Worker perde acesso se chave divergir", "Baixo trafego", "/whatsapp/status retorna 200"],
                ["Trocar hostname do tunnel", "Worker aponta para origem errada", "Baixo trafego", "GET hostname retorna Welcome Evolution"],
                ["Atualizar Evolution image", "Migracoes e compatibilidade", "Janela controlada", "Boot, status, envio teste"],
                ["Alterar fila", "Duplicidade ou perda de mensagens", "Com fila pausada", "Mensagem teste e log Firestore"],
            ],
            [45 * mm, 50 * mm, 38 * mm, 43 * mm],
        )
    )
    story.append(PageBreak())

    story.append(p("12. Evolucao Recomendada", "H1"))
    story.append(
        table(
            [
                ["Prioridade", "Melhoria", "Beneficio"],
                ["Alta", "Migrar segredos para wrangler secret", "Reduz risco de vazamento em arquivos versionados"],
                ["Alta", "Restringir CORS aos dominios oficiais", "Diminui superficie publica do Worker"],
                ["Media", "Adicionar endpoint health consolidado", "Diagnostico rapido de Worker, Tunnel, Evolution e instancia"],
                ["Media", "Mover fila para Cloudflare Queues", "Melhor semantica de entrega e retry"],
                ["Media", "Alertas Cloudflare Tunnel e Docker", "Reduz tempo de deteccao de queda"],
                ["Baixa", "Dashboard tecnico de WhatsApp", "Visibilidade para administracao sem acessar logs"],
            ],
            [28 * mm, 70 * mm, 78 * mm],
        )
    )
    story.append(
        p(
            "A arquitetura atual ja esta funcional para operacao do evento. As recomendacoes acima nao bloqueiam o uso, mas aumentam maturidade, governanca e seguranca antes de campanhas de maior volume.",
            "Body",
        )
    )
    story.append(PageBreak())

    story.append(p("13. Inventario Tecnico", "H1"))
    story.append(
        table(
            [
                ["Item", "Valor"],
                ["Worker", "mcu-nightrun-api"],
                ["Worker publico", "https://mcu-nightrun-api.thayrufino2.workers.dev"],
                ["Evolution publica", "https://whatsapp.mcunightrun.com.br"],
                ["Instancia", "mcu_nightrun_uba"],
                ["Tunnel", "mcu-nightrun-whatsapp"],
                ["Containers", "nightrun_evolution_api, nightrun_evolution_redis, nightrun_evolution_tunnel"],
                ["Neon", "Projeto dedicado para Evolution, banco neondb, branch main"],
                ["KV", "NIGHTRUN_STORAGE"],
                ["R2", "MEDIA_BUCKET / mcu-nightrun-media"],
                ["Firestore logs", "whatsapp_logs"],
            ],
            [48 * mm, 128 * mm],
        )
    )
    story.append(
        Callout(
            "Escopo de confidencialidade",
            "Este documento descreve a arquitetura e operacao, mas omite API keys, tokens Cloudflare, connection strings Neon, chaves Asaas e segredos de webhook.",
            "blue",
        )
    )

    doc.build(story, onFirstPage=on_first_page, onLaterPages=on_later_page)
    print(OUT)


if __name__ == "__main__":
    build()
