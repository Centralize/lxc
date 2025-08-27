#!/bin/bash
#
# Filnavn: install_lxd.sh
# Beskrivelse: Installerer den seneste stabile version af LXD via Snap på Ubuntu
#             og udfører grundlæggende konfiguration.
# Forfatter: SysAdmin
# Version: 1.1
#
# Dette script skal køres med root-privilegier (f.eks. ved hjælp af sudo).

# --- Konfiguration og Sikkerhed ---
# Afslut øjeblikkeligt, hvis en kommando afsluttes med en status forskellig fra nul.
set -e
# Behandl udefinerede variable som en fejl under substitution.
set -u
# Pipelines returnerer exit-status for den sidste kommando, der fejlede.
set -o pipefail

# --- Logfunktioner ---
log() {
    echo "[INFO] $(date +'%Y-%m-%d %H:%M:%S') - $1"
}

error() {
    echo "[ERROR] $(date +'%Y-%m-%d %H:%M:%S') - $1" >&2
    exit 1
}

# --- Forberedende Tjek ---
log "Starter LXD installationsscript."

# 1. Tjek for root-privilegier
if [ "$(id -u)" -ne 0 ]; then
    error "Dette script skal køres som root eller med sudo. Brug venligst 'sudo ./install_lxd.sh'."
fi

# 2. Tjek for snapd (standard på Ubuntu, men god praksis at verificere)
if ! command -v snap &> /dev/null; then
    log "Kommandoen 'snap' blev ikke fundet. Forsøger at installere snapd..."
    apt-get update
    apt-get install -y snapd
    if ! command -v snap &> /dev/null; then
        error "Kunne ikke installere snapd. Installer det venligst manuelt og kør scriptet igen."
    fi
    log "snapd installeret succesfuldt."
fi

# --- Installation ---
log "Installerer den seneste stabile version af LXD fra Snap..."
# Snap install er idempotent. Det vil installere eller opdatere til den seneste stabile version.
if ! snap install lxd; then
    error "Installationen af LXD via Snap fejlede."
fi

log "Venter på, at LXD daemon er klar..."
if ! lxd.waitready --timeout=60; then
    error "LXD daemon startede ikke inden for den forventede tid."
fi

# --- Konfiguration efter installation ---
# Brug SUDO_USER til at hente navnet på den bruger, der kaldte sudo.
# Fallback til logname, hvis SUDO_USER ikke er sat (f.eks. script kørt direkte som root).
CURRENT_USER="${SUDO_USER:-$(logname)}"

log "Tilføjer bruger '$CURRENT_USER' til 'lxd'-gruppen..."
if groups "$CURRENT_USER" | grep -q '\blxd\b'; then
    log "Bruger '$CURRENT_USER' er allerede medlem af 'lxd'-gruppen."
else
    if ! adduser "$CURRENT_USER" lxd; then
        error "Kunne ikke tilføje bruger '$CURRENT_USER' til 'lxd'-gruppen."
    fi
    log "Bruger '$CURRENT_USER' er blevet tilføjet til 'lxd'-gruppen."
    log "En ny shell-session er påkrævet, for at denne ændring træder i kraft."
fi

# Initialiser LXD med standardindstillinger, hvis det ikke allerede er initialiseret.
if ! lxc profile show default &> /dev/null; then
    log "Initialiserer LXD med standardindstillinger..."
    lxd init --auto
else
    log "LXD ser ud til allerede at være initialiseret. Springer 'lxd init' over."
fi

# --- Verificering ---
log "Verificerer installationen ved at køre 'lxc list'..."
# 'sg' eksekverer kommandoen med den nye gruppetilhørsforhold med det samme.
if sg lxd -c "lxc list" &> /dev/null; then
    log "Verificering lykkedes. 'lxc list' kommandoen blev udført uden fejl."
else
    error "Verificering fejlede. Der kan være et problem med LXD-installationen eller tilladelserne."
fi

# --- Afsluttende Besked ---
echo ""
log "------------------------------------------------------------------"
log "✅ LXD installation og grundlæggende konfiguration er fuldført."
log ""
log "VIGTIGT: Du skal muligvis starte en ny shell eller logge ud og"
log "ind igen, for at dine gruppeændringer træder i kraft fuldt ud."
log ""
log "Du kan nu begynde at bruge LXC-kommandoer, f.eks.:"
log "lxc launch images:ubuntu/22.04 min-foerste-container"
log "lxc list"
log "------------------------------------------------------------------"

exit 0
