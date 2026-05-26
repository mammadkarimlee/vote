begin;

alter policy pkpd_portfolios_select on public.pkpd_portfolios
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_portfolios_insert on public.pkpd_portfolios
with check (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_portfolios_update on public.pkpd_portfolios
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
)
with check (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

alter policy pkpd_portfolios_delete on public.pkpd_portfolios
using (
  public.is_superadmin()
  or (
    public.is_branch_staff()
    and public.current_org_id() = org_id
    and public.current_branch_id() = branch_id
  )
  or (public.is_hr() and public.current_org_id() = org_id)
);

commit;
