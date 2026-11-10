using { jones.vob.VendorRequests } from './schema';
namespace jones.vob;
extend VendorRequests with {
  routeSnapshot : LargeString;
};
entity ApprovalRoutes {
  key ID : String(40);
  priority : Integer;
  name : String(100);
  active : Boolean default true;
  accountTypes : String(100);
  paymentTerms : String(100);
  companyCode : String(100);
  country : String(100);
  steps : String(200);
  bankCheckMode : String(20) default 'SEPARATE';
}
