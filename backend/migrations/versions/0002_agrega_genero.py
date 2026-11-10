"""agrega tabla genero y libro.genero_id

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-12

Segunda etapa del plan: se incorpora la agregación Libro -> Genero.
Equivale al autogenerate con `generos` ya incluido en app/modules/models.py:

- crea la tabla `genero`;
- agrega la columna `libro.genero_id` (nullable, como en el modelo);
- crea la FK `fk_libro_genero_id` y su índice (PostgreSQL no indexa FK solo).
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "genero",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.UniqueConstraint("nombre", name="uq_genero_nombre"),
    )
    op.add_column("libro", sa.Column("genero_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_libro_genero_id", "libro", "genero", ["genero_id"], ["id"]
    )
    op.create_index("ix_libro_genero_id", "libro", ["genero_id"])


def downgrade() -> None:
    op.drop_index("ix_libro_genero_id", table_name="libro")
    op.drop_constraint("fk_libro_genero_id", "libro", type_="foreignkey")
    op.drop_column("libro", "genero_id")
    op.drop_table("genero")
