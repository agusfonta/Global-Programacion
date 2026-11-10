"""esquema inicial (todas las tablas menos genero)

Revision ID: 0001
Revises:
Create Date: 2026-10-12

NOTA: este archivo equivale a lo que produce `alembic revision --autogenerate`,
revisado y corregido a mano. Correcciones aplicadas (marcadas con FIX):

- Se quitó la columna `libro.genero_id` y su índice `ix_libro_genero_id`.
  Motivo: el plan pide que la columna y la tabla `genero` lleguen recién en la
  migración 0002. Como el modelo `Libro` define `genero_id` con FK a `genero.id`,
  el autogenerate la emitiría igual aunque no se importe `generos`; por eso se
  elimina a mano acá.
- Se agregó el índice `ix_libro_autor_autor_id` para la FK `libro_autor.autor_id`
  (PostgreSQL no indexa las FK automáticamente; el modelo lo declara con
  index=True).
- Se nombraron los UNIQUE (`uq_*`) para que el downgrade y el esquema queden
  legibles; el autogenerate los emite sin nombre.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "editorial",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("pais", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.UniqueConstraint("nombre", name="uq_editorial_nombre"),
    )
    op.create_table(
        "autor",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("nacionalidad", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
    )
    op.create_table(
        "cliente",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.UniqueConstraint("email", name="uq_cliente_email"),
    )
    op.create_table(
        "libro",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("isbn", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("titulo", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("precio", sa.Numeric(10, 2), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=False),
        sa.Column("editorial_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["editorial_id"], ["editorial.id"]),
        sa.UniqueConstraint("isbn", name="uq_libro_isbn"),
        sa.CheckConstraint("precio > 0", name="ck_libro_precio_positivo"),
        sa.CheckConstraint("stock >= 0", name="ck_libro_stock_no_negativo"),
    )
    op.create_index("ix_libro_editorial_id", "libro", ["editorial_id"])

    op.create_table(
        "libro_autor",
        sa.Column("libro_id", sa.Integer(), primary_key=True),
        sa.Column("autor_id", sa.Integer(), primary_key=True),
        sa.Column("rol", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["autor_id"], ["autor.id"]),
        sa.ForeignKeyConstraint(["libro_id"], ["libro.id"]),
        sa.CheckConstraint("orden >= 1", name="ck_libro_autor_orden_positivo"),
        sa.CheckConstraint(
            "rol IN ('autor', 'coautor', 'traductor', 'ilustrador')",
            name="ck_libro_autor_rol_valido",
        ),
    )
    # FIX: índice para la FK autor_id (la parte libro_id ya es PK).
    op.create_index("ix_libro_autor_autor_id", "libro_autor", ["autor_id"])

    op.create_table(
        "perfil_cliente",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("telefono", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("direccion", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(["cliente_id"], ["cliente.id"]),
        sa.UniqueConstraint("cliente_id", name="uq_perfil_cliente_cliente_id"),
    )
    op.create_index("ix_perfil_cliente_cliente_id", "perfil_cliente", ["cliente_id"])

    op.create_table(
        "venta",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["cliente_id"], ["cliente.id"]),
        sa.CheckConstraint("total >= 0", name="ck_venta_total"),
    )
    op.create_index("ix_venta_cliente_id", "venta", ["cliente_id"])

    op.create_table(
        "renglon_venta",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("venta_id", sa.Integer(), nullable=False),
        sa.Column("libro_id", sa.Integer(), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("precio_unitario", sa.Numeric(10, 2), nullable=False),
        sa.ForeignKeyConstraint(["libro_id"], ["libro.id"]),
        sa.ForeignKeyConstraint(["venta_id"], ["venta.id"]),
        sa.CheckConstraint("cantidad > 0", name="ck_renglon_venta_cantidad"),
        sa.CheckConstraint("precio_unitario > 0", name="ck_renglon_venta_precio"),
    )
    op.create_index("ix_renglon_venta_libro_id", "renglon_venta", ["libro_id"])
    op.create_index("ix_renglon_venta_venta_id", "renglon_venta", ["venta_id"])


def downgrade() -> None:
    op.drop_index("ix_renglon_venta_venta_id", table_name="renglon_venta")
    op.drop_index("ix_renglon_venta_libro_id", table_name="renglon_venta")
    op.drop_table("renglon_venta")

    op.drop_index("ix_venta_cliente_id", table_name="venta")
    op.drop_table("venta")

    op.drop_index("ix_perfil_cliente_cliente_id", table_name="perfil_cliente")
    op.drop_table("perfil_cliente")

    op.drop_index("ix_libro_autor_autor_id", table_name="libro_autor")
    op.drop_table("libro_autor")

    op.drop_index("ix_libro_editorial_id", table_name="libro")
    op.drop_table("libro")

    op.drop_table("cliente")
    op.drop_table("autor")
    op.drop_table("editorial")
