<p align="center">
  <img src="assets/legion-wordmark.png" alt="LEGION" width="360">
</p>

<p align="center"><a href="README.md">English</a> · <strong>Español</strong></p>

# Sistema Multiagente Dinámico — N historias de usuario en paralelo, cualquier proyecto

<img src="assets/legion-l-mark.png" alt="L" width="18" align="absmiddle"> **EGION** es un sistema de orquestación multiagente para desarrollar **N historias de usuario en paralelo** con Claude Code, sobre un único clone del repositorio destino. El nombre no es decorativo: la estructura de una legión romana — un comandante que dirige sin pelear cuerpo a cuerpo, centuriones con autoridad delegada en su dominio, formación disciplinada antes de avanzar, señales que circulan sin romper la cadena de mando — es, pieza por pieza, el mismo problema que resuelve este sistema.

En la práctica: **un único repo base + un `git worktree` por historia de usuario, creado on-demand**. No hay límite de cantidad de historias de usuario — un **scheduler de tandas** procesa hasta `MAX_PARALLEL` en simultáneo (cuántas historias de usuario se implementan a la vez como máximo, default 3, para no saturar tu máquina — el resto espera en cola) y serializa automáticamente las que se pisan. Funciona sobre **cualquier proyecto** — el conocimiento específico del stack (lenguaje, framework, comandos de build/test, herramienta de migraciones) vive en un único archivo de configuración, no en el protocolo.

Un **Agente Orquestador** (la sesión de Claude Code en esta carpeta raíz) coordina un **agente implementador por historia de usuario** (generalista o especialista, según corresponda) y un **revisor adversario** por entrega. Los agentes no se hablan entre sí: toda coordinación pasa por el orquestador — salvo dos excepciones explícitas de escritura fuera del worktree (ver "Reglas del sistema" más abajo).

> **Nota sobre el idioma de uso**:
> - **Comandos, nombres de archivo/carpeta, tokens de eventos**: siempre en inglés (`/legion`, `worktree-agent`, `FINALIZED`...) — nunca cambia.
> - **Conversación con el agente** (preguntas, explicaciones): sigue el idioma en el que vos le escribas, automáticamente — no hay nada que configurar.
> - **Contenido que el agente *persiste*** (la descripción de una historia, la documentación generada): sigue el campo **"Content language"** de `.orchestrator/config.md` — por default es inglés, pero podés cambiarlo a cualquier otro idioma. Independiente del idioma en el que hayas charlado con el agente.

## Índice

- [Requisitos previos](#requisitos-previos)
- [1. Escribir las historias de usuario](#1-escribir-las-historias-de-usuario)
- [2. Comandos disponibles](#2-comandos-disponibles)
- [3. Seguir el progreso](#3-seguir-el-progreso)
- [4. Si se corta la sesión](#4-si-se-corta-la-sesión)
- [5. Al terminar — cosecha](#5-al-terminar--cosecha)
- [Reglas del sistema](#reglas-del-sistema-las-importantes)
- [Anatomía del sistema](#anatomía-del-sistema)
- [Licencia](#licencia)

## Requisitos previos

1. **Un único repo base**: cloná el proyecto destino **dentro de [workspace/](workspace/)** (un solo clone, no N). El sistema lo detecta solo: es el único subdirectorio de `workspace/` con `.git` (aparte de `worktrees/`, que crea el propio sistema).
2. **Baseline commiteado (idealmente)**: los worktrees nacen del COMMIT de la rama base, no de tu working tree — **no hace falta que hagas checkout manual a esa rama antes de orquestar**. Si el repo base está parado en cualquier rama que no sea la base, no hay nada que preparar. Si **sí** está parado en la rama base y tiene cambios sin commitear, `/legion` no aborta directo: te pregunta si continuar igual (ese cambio queda afuera de todos los worktrees — útil para un archivo que a propósito nunca se commitea, ej. un `.properties` local), descartarlo, o abortar la ejecución. `/legion` también actualiza la rama base contra el remoto (`fetch`) antes de arrancar, y te avisa si está desactualizada.
3. **Historias de usuario escritas** en `requirements-to-work.md` — **todas las que quieras, sin límite**.
4. **Configuración del proyecto** en `.orchestrator/config.md`: si es la primera vez que corrés el sistema sobre este repo, `/legion` investiga el código y te pregunta lo que falte (rama base, prefijo de rama, `MAX_PARALLEL`, comandos de verificación, herramienta de migraciones, archivos locales que copiar a cada worktree, etc.) y lo deja guardado para las próximas ejecuciones.

## 1. Escribir las historias de usuario

### Si todavía no tenés historias de usuario, solo un objetivo: `/new-objective`

Si lo que tenés es una intención de alto nivel ("reducir el tiempo de checkout un 30%") en vez de historias de usuario delimitadas, `/new-objective` investiga el repo base, propone un corte en historias de usuario concretas (confirmado con vos), lo persiste en `.orchestrator/objectives/OBJ-<NNN>.md`, y especifica cada historia resultante con la misma profundidad que `/new-story` — guardándolas en `requirements-to-work.md` a medida que las confirmás. `/legion` también detecta un bloque `# OBJECTIVE` pegado directo en el archivo y te ofrece correr esta misma descomposición ahí mismo.

### Opción recomendada para una historia de usuario puntual: `/new-story` (asistente)

El skill te guía para crear cada historia de usuario **validada contra el código real**:

1. Te pide el **ID** (ej. `PROJ-100`) y la **descripción** en tus palabras.
2. Analiza la descripción contra el repo base: mapea qué módulos/servicios/endpoints/tablas toca, detecta si algo ya existe, y busca huecos (casos borde, estados, permisos, idempotencia, migraciones). Si la zona ya causó un incidente antes, `.orchestrator/lessons-learned.md` lo trae a colación.
3. **Te pregunta lo que no cierra**, citando el código que motiva cada duda, y te marca posibles bugs de aplicar la descripción tal cual.
4. Con tus respuestas redacta la historia de usuario final (descripción + criterios de aceptación + definiciones tomadas + zona de impacto) y la deja como preview en `.orchestrator/preview-story-<ID>.md` para que la leas/edites cómodo en tu editor — recién con tu confirmación (una pregunta con opciones, no texto para tipear) la aplica a `requirements-to-work.md` y borra el preview.

Las historias de usuario que salen de `/new-story` llegan mejor especificadas al gate de diseño: menos preguntas de los agentes, menos rondas de corrección.

### Opción manual

Editá [requirements-to-work.md](requirements-to-work.md). Formato obligatorio — bloques separados por `---`, encabezado `# Story <ID>`:

```md
# Story PROJ-100

Como usuario quiero ... para ...
Criterios de aceptación: ...

## Depends on (opcional)
PROJ-099   # no se lanza hasta que PROJ-099 esté finalizado — dependencia de negocio, no de código

## Subtasks (opcional)
1. [backend] Endpoint de exportación
2. [security] Revisión de qué campos son exportables (depende de 1)

---

# Story PROJ-101

...
```

**Sin límite de cantidad.** Si dos historias de usuario se pisan en código, el sistema las serializa automáticamente en tandas distintas — no hace falta coordinarlo vos. `## Depends on` es distinto: una dependencia de negocio explícita, no de solapamiento. `## Subtasks` es para el caso puntual en que una historia de usuario mezcla dominios que necesitan un gate de aprobación propio (ej. una revisión de seguridad que puede rechazarla por su cuenta) — se ejecutan en secuencia, sobre el mismo worktree.

## 2. Comandos disponibles

Todos se corren en la sesión de Claude Code de esta carpeta raíz:

| Comando | Qué hace |
|---------|----------|
| `/new-objective` | Parte un objetivo de alto nivel (sin historias de usuario todavía) en varias historias concretas, confirmadas una por una |
| `/new-story` | Asistente para crear una historia de usuario: analiza tu descripción contra el código y pregunta lo que no cierra antes de escribirla |
| `/legion` | Ejecución completa: tandas, worktrees, diseño, implementación, revisión, hasta vaciar la cola |
| `/legion dry-run` | Corre hasta el gate de la primera tanda y **frena**: deja los planes como archivos revisables en `.orchestrator/designs/` y espera tu veredicto por historia de usuario (aprobar / ajustar / descartar) antes de implementar |
| `/legion MAX_PARALLEL=<n>` | Ajusta el **techo** de agentes implementando a la vez — si hay menos historias de usuario disponibles que `<n>`, corren menos, nunca se fuerza el número (si no lo pasás, usa el valor guardado en `config.md`, default 3) |
| `/investigate` | Lanza el agente de investigación (modo spike) sobre una pregunta técnica puntual, sin worktree ni implementación — publica el hallazgo como Announcement |
| `/new-lesson` | Registra un incidente real (regla de negocio no contemplada) en `.orchestrator/lessons-learned.md`, para que futuras historias de usuario sobre la misma zona lo encuentren antes de repetirlo |

Recomendación: **dry-run para historias de usuario grandes, ambiguas o que puedan solaparse** — revisar varios diseños en papel cuesta minutos; re-implementar cuesta horas.

### Qué pasa por dentro (resumen)

0. **Configuración**: si `.orchestrator/config.md` no está resuelto para este proyecto, se investiga el repo y se te pregunta lo que falte (stack, comandos, migraciones, ramas, `MAX_PARALLEL`).
1. **Validación**: repo base único, actualizado contra el remoto (`fetch`, con aviso si está desactualizado) y limpio si está parado en la rama base, historias de usuario parseadas (sin límite de cantidad).
2. **Pre-análisis y plan de tandas**: se estima qué toca cada historia de usuario y se arma el grafo de conflictos (más las dependencias `## Depends on` como aristas dirigidas); las que se pisan van a tandas distintas (serialización automática). **El plan se te muestra antes de lanzar.**
3. **Selección de agente**: por historia de usuario, el orquestador decide si la toma el generalista (`worktree-agent`) o un especialista (frontend, seguridad, datos, documentación — ver `.orchestrator/capabilities.md`), o si se parte en `## Subtasks` cuando un dominio necesita su propio gate de aprobación. Si la zona se considera de riesgo, corre primero `research-agent` en modo investigación previa.
4. **Provisioning**: por cada historia de usuario de la tanda activa, el orquestador crea su `git worktree` con su rama y copia los archivos locales que el worktree no trae (reglas del proyecto, docs).
5. **Gate de diseño por tanda**: cada agente propone su diseño en papel y espera. El orquestador compara las propuestas juntas y contra la memoria arquitectónica (`components.md` + diseños de tandas anteriores), asigna nombres/orden de migraciones (si el proyecto las usa) con un contador global, y recién ahí aprueba. Nadie escribe código sin aprobación.
6. **Implementación**: cada agente implementa su historia de usuario respetando las reglas del proyecto y la guía de patrones/code smells (más `security-guide`/`data-guide` si es el especialista correspondiente), con tests, reportando cada archivo tocado. Si descubre algo urgente o reutilizable a mitad de camino, lo comparte de inmediato con las demás historias activas vía **Signals** (alertas con vencimiento) o **Announcements** (conocimiento en caliente) — sin esperar al próximo gate.
7. **Verificación funcional (opcional)**: en historias de usuario con criterios de aceptación complejos, `worktree-agent-qa` deriva escenarios reales y los corre antes de pasar al revisor.
8. **Revisión adversaria**: al terminar cada historia de usuario, un revisor independiente re-ejecuta las verificaciones, audita las reglas de arquitectura y la checklist de smells. Rechazado → el agente corrige (máx. 3 rondas, después se escala a vos).
9. **Rotación de la cola**: historia de usuario aprobada → se libera un slot → entra la siguiente de la cola (respetando `## Depends on`) con su propio worktree.
10. **Cierre**: consistencia final + **trial-merge** (`git merge-tree`, solo lectura) para verificar que todas las ramas mergean contra la rama base y entre sí + recalcula `.orchestrator/reputation.md`.
11. **Corrección post-cierre (opcional)**: te pregunta si querés pedir un cambio sobre alguna historia de usuario ya finalizada — si sí, reengancha al agente original sin repetir configuración/diseño, corre una ronda nueva del revisor, y vuelve a `finalized`.

## 3. Seguir el progreso

Todo el estado vive en [.orchestrator/](.orchestrator/):

- **[config.md](.orchestrator/config.md)** — parámetros resueltos del proyecto destino (repo base, stack, comandos, migraciones, `MAX_PARALLEL`). Se completa solo la primera vez.
- **[capabilities.md](.orchestrator/capabilities.md)** — registro de tipos de agente disponibles (generalista + especialistas) y cuándo corresponde cada uno.
- **[assignments.md](.orchestrator/assignments.md)** — el tablero: historia de usuario, worktree, rama, tanda, estado (incluye `queued`), última actividad, ronda de revisión. Debajo: matriz de solapamiento y plan de tandas.
- **designs/`<Story-ID>`.md** — el diseño de cada historia de usuario aprobado en el gate. En dry-run quedan en `PENDING APPROVAL`: **estos son los archivos que revisás** para aprobar o descartar cada plan (podés anotar ajustes directamente en el archivo).
- **events/`<Story-ID>`.md** — log en tiempo real de cada agente (archivos creados/modificados, refactors, decisiones).
- **reviews/`<Story-ID>`-Rn.md** — informes del revisor adversario por ronda.
- **decisions/DEC-NNN.md** — decisiones arquitectónicas cuando dos historias de usuario resolvieron lo mismo distinto.
- **[components.md](.orchestrator/components.md)** — catálogo de componentes reutilizables entre historias de usuario/tandas (se consulta antes de crear nada nuevo).
- **signals/`<ID>`.md** — alertas de prioridad entre historias de usuario activas, con vencimiento si nadie las refuerza; cualquier agente las escribe directamente.
- **announcements/`<ID>`.md** — conocimiento reutilizable compartido en caliente entre historias de usuario activas, antes de que el gate lo consolide en `components.md`.
- **[lessons-learned.md](.orchestrator/lessons-learned.md)** — incidentes reales por regla de negocio no contemplada, permanente entre ejecuciones (alimentado por `/new-lesson`).
- **objectives/OBJ-`<NNN>`.md** — descomposición de un objetivo de alto nivel en historias de usuario, con su razonamiento (generado por `/new-objective`).
- **[reputation.md](.orchestrator/reputation.md)** — auditoría de solo lectura por agente/dominio (tasa de aprobación en 1ª ronda, hallazgos post-cierre, correcciones post-cierre). El orquestador nunca la consulta para decidir nada — es para que vos sepas qué ajustar del sistema.

## 4. Si se corta la sesión

Nada se pierde. Volvé a correr `/legion`: detecta la ejecución a medias en el tablero, reconstruye el contexto desde los eventos, los diseños y `git worktree list` (git es la verdad), y **reanuda** solo lo incompleto (los agentes continúan sobre sus worktrees existentes, sin rehacer lo hecho) y recompone la cola de tandas pendientes.

## 5. Al terminar — cosecha

Cada historia de usuario queda en su worktree con los cambios **sin commitear** en su rama. Para revisar o editar una historia de usuario: **abrí su carpeta** (`workspace/worktrees/<Story-ID>/`) en tu editor — ya estás en la rama (no intentes hacer checkout de esa rama desde otro lado: git lo bloquea porque está checked out en el worktree). Por diseño, ningún agente commitea, pushea ni crea PRs — eso queda en tus manos:

```bash
cd workspace/worktrees/<Story-ID>
git status                    # revisar el trabajo
# commit cuando estés conforme (la rama ya vive en el repo base)
# push / PR desde donde prefieras
```

**Importante**: no borres un worktree sin commitear — el trabajo vive solo ahí. Después de cosechar, pedile al orquestador la limpieza (`git worktree remove` + borrar la rama si ya mergeó) o hacelo vos.

## Reglas del sistema (las importantes)

- El orquestador **nunca** edita código de los worktrees (solo administra crearlos/borrarlos); solo escribe en `.orchestrator/`.
- Los agentes trabajan **solo** en su worktree; las ramas las crea el orquestador (nacen con el worktree). Pueden escribir Signals/Announcements en `.orchestrator/` para avisar a otras historias de usuario activas — es depositar información en el ambiente compartido, no coordinarse directamente con otro worktree.
- **Dos excepciones explícitas** de escritura fuera del worktree: `worktree-agent-docs` escribe en `docs/<base-repo>/` en vez de en el repo destino (siempre Markdown); `worktree-agent-data` deja la migración en el worktree, pero cualquier script auxiliar de backfill/rollback va en `scripts/<base-repo>/`. Ambas carpetas se crean recién la primera vez que ese agente corre — no existen hasta entonces. Ningún otro agente sale de su worktree.
- Ninguna historia de usuario se cierra sin el `APPROVED` del revisor adversario.
- Nadie commitea/pushea/crea PRs — cosechás vos.
- No se asumen herramientas o verificaciones que no estén confirmadas en `.orchestrator/config.md` o en las reglas reales del repo base.
- `.orchestrator/reputation.md` es de solo lectura para vos — nunca cambia el comportamiento del orquestador (no hay ningún "gate liviano" en este sistema).

## Anatomía del sistema

```
<raíz>/
├── README.md                        ← estás acá (en inglés)
├── README.es.md                     ← esta versión, en español
├── LICENSE.md                       # Licencia de uso del sistema
├── CLAUDE.md                        # Protocolo del Agente Orquestador
├── requirements-to-work.md          # Tus historias de usuario (N, sin límite) o un # OBJECTIVE de alto nivel
├── assets/                          # Marca (wordmark, mark)
├── docs/<base-repo>/                # Documentación generada por worktree-agent-docs (siempre .md)
├── scripts/<base-repo>/             # Scripts auxiliares de worktree-agent-data (backfill/rollback)
├── workspace/
│   ├── README.md
│   ├── <base-repo>/                 # Único clone real del proyecto destino
│   └── worktrees/<Story-ID>/        # Un worktree por historia de usuario (los crea la orquestación)
├── .claude/
│   ├── agents/
│   │   ├── worktree-agent.md               # Implementador generalista (default)
│   │   ├── worktree-agent-frontend.md      # Especialista de UI/interfaz
│   │   ├── worktree-agent-security.md      # Especialista de auditoría/hardening
│   │   ├── worktree-agent-data.md          # Especialista de modelado/migraciones
│   │   ├── worktree-agent-qa.md            # Verificación funcional post-implementación
│   │   ├── worktree-agent-docs.md          # Especialista de documentación
│   │   ├── research-agent.md               # Spikes + investigación previa (sin worktree, solo lectura)
│   │   └── worktree-reviewer.md            # Revisor adversario (solo lectura)
│   └── skills/
│       ├── legion/             # /legion y /legion dry-run
│       ├── new-objective/           # /new-objective — parte un objetivo alto en varias historias de usuario
│       ├── new-story/               # /new-story — asistente para escribir historias validadas contra el código
│       ├── new-lesson/              # /new-lesson — registra un incidente real
│       ├── investigate/             # /investigate — modo spike standalone
│       ├── patterns-and-smells/     # Guía de patrones + code smells, adaptada al proyecto destino
│       ├── security-guide/          # Checklist OWASP para worktree-agent-security
│       └── data-guide/              # Checklist de migraciones/modelado para worktree-agent-data
└── .orchestrator/                   # Estado y comunicación (config, tablero, eventos, revisiones, decisiones, reputación)
```

Detalle completo del protocolo: [CLAUDE.md](CLAUDE.md) (orquestador), [.orchestrator/README.md](.orchestrator/README.md) (formato del bus de eventos y de cada artefacto).

## Licencia

Ver [LICENSE.md](LICENSE.md) para el texto completo. En resumen: **uso libre, incluido uso interno
en empresas**; **prohibida** la redistribución del código, la venta, crear otro producto a partir
de él, o incorporarlo en otro software sin autorización — reseñar/mostrar el proyecto (con link a
la fuente oficial) y forkear para contribuir vía PR sí están permitidos explícitamente.
