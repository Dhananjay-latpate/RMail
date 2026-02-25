/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

use common::{Server, auth::AccessToken};
use directory::{
    Permission, Type,
    backend::internal::{
        PrincipalField, PrincipalSet, PrincipalValue,
        manage::{self, ManageDirectory},
    },
};
use http_proto::*;
use hyper::Method;
use serde_json::json;
use std::future::Future;

/// Request body for organization provisioning.
/// Creates a tenant, domain, and admin user in a single API call.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationProvisionRequest {
    // Tenant / Organization
    pub tenant_name: String,
    pub domain: String,

    // Admin user
    pub admin_name: String,
    pub admin_password: String,
    pub admin_email: String,

    // Optional branding
    #[serde(default)]
    pub brand_name: Option<String>,
    #[serde(default)]
    pub brand_logo_url: Option<String>,
    #[serde(default)]
    pub brand_theme: Option<String>,

    // Optional org description
    #[serde(default)]
    pub description: Option<String>,
}

/// Response for organization provisioning
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationProvisionResponse {
    pub tenant_id: u32,
    pub domain_id: u32,
    pub admin_id: u32,
}

pub trait OrganizationManager: Sync + Send {
    fn handle_manage_organization(
        &self,
        req: &HttpRequest,
        path: Vec<&str>,
        body: Option<Vec<u8>>,
        access_token: &AccessToken,
    ) -> impl Future<Output = trc::Result<HttpResponse>> + Send;
}

impl OrganizationManager for Server {
    async fn handle_manage_organization(
        &self,
        req: &HttpRequest,
        path: Vec<&str>,
        body: Option<Vec<u8>>,
        access_token: &AccessToken,
    ) -> trc::Result<HttpResponse> {
        match (path.get(1).copied(), req.method()) {
            (Some("provision"), &Method::POST) => {
                // Require TenantCreate, DomainCreate, and IndividualCreate permissions
                access_token.assert_has_permission(Permission::TenantCreate)?;
                access_token.assert_has_permission(Permission::DomainCreate)?;
                access_token.assert_has_permission(Permission::IndividualCreate)?;

                // Parse request body
                let request = serde_json::from_slice::<OrganizationProvisionRequest>(
                    body.as_deref().unwrap_or_default(),
                )
                .map_err(|err| {
                    trc::EventType::Resource(trc::ResourceEvent::BadParameters)
                        .from_json_error(err)
                })?;

                // Validate required fields
                if request.tenant_name.is_empty() {
                    return Err(manage::err_missing("tenantName"));
                }
                if request.domain.is_empty() {
                    return Err(manage::err_missing("domain"));
                }
                if request.admin_name.is_empty() {
                    return Err(manage::err_missing("adminName"));
                }
                if request.admin_password.is_empty() {
                    return Err(manage::err_missing("adminPassword"));
                }
                if request.admin_email.is_empty() {
                    return Err(manage::err_missing("adminEmail"));
                }

                let tenant_id = access_token.tenant.map(|t| t.id);

                // Step 1: Create the tenant
                let mut tenant = PrincipalSet::default();
                tenant.typ = Type::Tenant;
                tenant
                    .fields
                    .insert(PrincipalField::Name, PrincipalValue::String(request.tenant_name));
                if let Some(description) = &request.description {
                    tenant.fields.insert(
                        PrincipalField::Description,
                        PrincipalValue::String(description.clone()),
                    );
                }
                if let Some(brand_name) = &request.brand_name {
                    tenant.fields.insert(
                        PrincipalField::BrandName,
                        PrincipalValue::String(brand_name.clone()),
                    );
                }
                if let Some(brand_logo_url) = &request.brand_logo_url {
                    tenant.fields.insert(
                        PrincipalField::BrandLogoUrl,
                        PrincipalValue::String(brand_logo_url.clone()),
                    );
                }
                if let Some(brand_theme) = &request.brand_theme {
                    tenant.fields.insert(
                        PrincipalField::BrandTheme,
                        PrincipalValue::String(brand_theme.clone()),
                    );
                }

                let tenant_result = self
                    .core
                    .storage
                    .data
                    .create_principal(tenant, tenant_id, Some(&access_token.permissions))
                    .await?;
                let new_tenant_id = tenant_result.id;

                self.invalidate_principal_caches(tenant_result.changed_principals)
                    .await;

                // Step 2: Create the domain under this tenant
                let mut domain = PrincipalSet::default();
                domain.typ = Type::Domain;
                domain
                    .fields
                    .insert(PrincipalField::Name, PrincipalValue::String(request.domain));

                let domain_result = self
                    .core
                    .storage
                    .data
                    .create_principal(domain, Some(new_tenant_id), Some(&access_token.permissions))
                    .await?;
                let new_domain_id = domain_result.id;

                self.invalidate_principal_caches(domain_result.changed_principals)
                    .await;

                // Step 3: Create admin user under this tenant with tenant-admin role
                let mut admin = PrincipalSet::default();
                admin.typ = Type::Individual;
                admin
                    .fields
                    .insert(PrincipalField::Name, PrincipalValue::String(request.admin_name));
                admin.fields.insert(
                    PrincipalField::Secrets,
                    PrincipalValue::StringList(vec![request.admin_password]),
                );
                admin.fields.insert(
                    PrincipalField::Emails,
                    PrincipalValue::StringList(vec![request.admin_email]),
                );
                admin.fields.insert(
                    PrincipalField::Roles,
                    PrincipalValue::StringList(vec!["tenant-admin".to_string()]),
                );

                let admin_result = self
                    .core
                    .storage
                    .data
                    .create_principal(admin, Some(new_tenant_id), Some(&access_token.permissions))
                    .await?;
                let new_admin_id = admin_result.id;

                self.invalidate_principal_caches(admin_result.changed_principals)
                    .await;

                Ok(JsonResponse::new(json!({
                    "data": {
                        "tenantId": new_tenant_id,
                        "domainId": new_domain_id,
                        "adminId": new_admin_id,
                    }
                }))
                .into_http_response())
            }
            _ => Err(trc::ResourceEvent::NotFound.into_err()),
        }
    }
}
